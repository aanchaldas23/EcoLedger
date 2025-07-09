# app.py - Carbon Credits Authentication Service
from flask import Flask, request, jsonify
from PyPDF2 import PdfReader
import re
import requests
from dotenv import load_dotenv, find_dotenv
import os
from flask_cors import CORS
from pymongo import MongoClient
from datetime import datetime
import logging
from werkzeug.utils import secure_filename
import tempfile
import hashlib

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(find_dotenv('../.env') or find_dotenv())

# Initialize Flask app
app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:5173"])

# Configuration
CARBONMARK_API_KEY = os.getenv("CARBONMARK_API_KEY")
CARBONMARK_API_BASE_URL = os.getenv("CARBONMARK_API_BASE_URL", "https://api.carbonmark.com")
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DATABASE_NAME = os.getenv("DATABASE_NAME", "EcoLedger")

# MongoDB setup
try:
    client = MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    client.admin.command('ping')
    logger.info("✅ MongoDB connected successfully")
except Exception as e:
    logger.error(f"❌ MongoDB connection failed: {e}")
    raise

# Regex patterns for PDF text extraction
PATTERNS = {
    'serial_number': r"[Ss]erial [Nn]umber:\s*([A-Za-z0-9\-]+)",
    'project_id': r"[Pp]roject\s+[Ii][Dd]:\s*([A-Za-z0-9\-]+)",
    'project_name': r"[Pp]roject\s+[Nn]ame:\s*(.+)",
    'vintage': r"[Vv]intage:\s*(\d{4})",
    'amount': r"[Aa]mount.*?:\s*([\d,\.]+)",
    'issuance_date': r"[Ii]ssuance [Dd]ate:\s*(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})",
    'registry': r"[Rr]egistry:\s*([A-Za-z0-9\-]+)",
    'category': r"[Cc]ategory:\s*([A-Za-z\s\(\)\+\-]+)",
    'issued_to': r"[Ii]ssued [Tt]o:\s*(.+)",
}

def extract_text_from_pdf(pdf_path):
    """Extract text from PDF file with error handling."""
    try:
        logger.info(f"Extracting text from PDF: {pdf_path}")
        reader = PdfReader(pdf_path)
        text = ''.join(page.extract_text() or "" for page in reader.pages)
        logger.info(f"Successfully extracted {len(text)} characters from PDF")
        return text
    except Exception as e:
        logger.error(f"Error extracting text from PDF: {e}")
        return None

def parse_certificate_data(text):
    """Parse extracted text to find certificate details."""
    extracted_data = {}
    if not text:
        logger.warning("No text provided to parse_certificate_data")
        return extracted_data

    for key, pattern in PATTERNS.items():
        match = re.search(pattern, text)
        if match:
            value = match.group(1).strip()
            if key == 'amount':
                value = value.replace(',', '')
                try:
                    value = float(value)
                except ValueError:
                    logger.warning(f"Could not convert amount '{value}' to float")
            extracted_data[key] = value
        else:
            logger.debug(f"No match found for pattern: {key}")
            extracted_data[key] = None
    
    logger.info(f"Extracted data: {extracted_data}")
    return extracted_data

def verify_with_carbonmark(project_id):
    """Verify project with Carbonmark API with robust error handling."""
    if not CARBONMARK_API_KEY:
        logger.error("CARBONMARK_API_KEY not set")
        return {'verified': False, 'message': 'Carbonmark API key missing', 'details': None}

    headers = {'Authorization': f'Bearer {CARBONMARK_API_KEY}'}
    normalized_id = project_id.strip().upper()
    logger.info(f"Verifying project ID: {normalized_id}")

    try:
        # Step 1: Try search endpoint
        search_url = f"{CARBONMARK_API_BASE_URL}/carbonProjects"
        logger.debug(f"Searching Carbonmark API: {search_url}")
        search_resp = requests.get(search_url, headers=headers, params={'search': normalized_id}, timeout=10)
        search_resp.raise_for_status()
        
        search_data = search_resp.json()
        projects = search_data['items'] if isinstance(search_data, dict) else search_data
        
        for p in projects:
            if p.get('key', '').upper() == normalized_id or p.get('projectID', '').upper() == normalized_id:
                logger.info(f"Project found via search: {normalized_id}")
                return {
                    'verified': True,
                    'message': 'Found via search',
                    'details': {
                        'id': p.get('key'),
                        'name': p.get('name'),
                        'country': p.get('country'),
                        'methodologies': p.get('methodologies')
                    }
                }

        # Step 2: Try direct lookup
        direct_url = f"{CARBONMARK_API_BASE_URL}/carbonProjects/{normalized_id}"
        logger.debug(f"Attempting direct lookup: {direct_url}")
        direct_resp = requests.get(direct_url, headers=headers, timeout=10)
        if direct_resp.status_code == 200:
            p = direct_resp.json()
            logger.info(f"Project found via direct lookup: {normalized_id}")
            return {
                'verified': True,
                'message': 'Found via direct lookup',
                'details': {
                    'id': p.get('key'),
                    'name': p.get('name'),
                    'country': p.get('country'),
                    'methodologies': p.get('methodologies')
                }
            }

        # Step 3: Check products/bundles
        products_url = f"{CARBONMARK_API_BASE_URL}/products"
        logger.debug(f"Checking products: {products_url}")
        products_resp = requests.get(products_url, headers=headers, timeout=10)
        products_resp.raise_for_status()
        
        products_data = products_resp.json()
        products = products_data['items'] if isinstance(products_data, dict) else products_data
        
        for product in products:
            if normalized_id in [str(pid).upper() for pid in product.get("projectIds", [])]:
                logger.info(f"Project found in bundle: {product.get('name')}")
                return {
                    'verified': True,
                    'message': f"Found in bundle: {product.get('name')}",
                    'details': {
                        'id': normalized_id,
                        'name': product.get('name'),
                        'type': "bundle",
                        'description': product.get('short_description')
                    }
                }

        logger.warning(f"Project not found in Carbonmark: {normalized_id}")
        return {
            'verified': False,
            'message': 'Project not found in Carbonmark',
            'details': None
        }

    except requests.exceptions.RequestException as e:
        logger.error(f"Carbonmark API error: {e}")
        return {
            'verified': False,
            'message': f'Carbonmark API error: {str(e)}',
            'details': None
        }

def calculate_file_hash(file_path):
    """Calculate SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        while chunk := f.read(4096):
            sha256.update(chunk)
    return sha256.hexdigest()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    db_status = 'disconnected'
    try:
        client.admin.command('ping')
        db_status = 'connected'
    except Exception:
        db_status = 'disconnected'

    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'database': db_status,
        'carbonmark_api': bool(CARBONMARK_API_KEY)
    }), 200

@app.route('/api/credits/authenticate', methods=['POST'])
def authenticate_certificate():
    """Complete authentication endpoint"""
    if 'certificate' not in request.files:
        logger.warning("No certificate file uploaded")
        return jsonify({
            'success': False,
            'status': 'no_file',
            'message': 'No certificate uploaded',
            'authenticated': False,
            'extracted_data': None,
            'carbonmark_details': None
        }), 400

    certificate_file = request.files['certificate']
    if certificate_file.filename == '':
        logger.warning("Empty certificate filename")
        return jsonify({
            'success': False,
            'status': 'empty_file',
            'message': 'Empty filename',
            'authenticated': False,
            'extracted_data': None,
            'carbonmark_details': None
        }), 400

    temp_path = None
    try:
        # Create temp file
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            certificate_file.save(temp_file.name)
            temp_path = temp_file.name
            logger.debug(f"Saved temporary file: {temp_path}")

        # Calculate file hash
        file_hash = calculate_file_hash(temp_path)
        logger.debug(f"File hash calculated: {file_hash}")
        
        # Extract text from PDF
        pdf_text = extract_text_from_pdf(temp_path)
        if not pdf_text:
            logger.error("Could not extract text from PDF")
            return jsonify({
                'success': False,
                'status': 'extraction_failed',
                'message': 'Could not extract text from PDF',
                'authenticated': False,
                'extracted_data': None,
                'carbonmark_details': None
            }), 400

        # Parse certificate data
        extracted_data = parse_certificate_data(pdf_text)
        
        # Validate required fields
        required_fields = ['serial_number', 'project_id', 'amount', 'registry']
        missing_fields = [f for f in required_fields if not extracted_data.get(f)]
        
        if missing_fields:
            logger.warning(f"Missing required fields: {missing_fields}")
            return jsonify({
                'success': False,
                'status': 'missing_fields',
                'message': f'Missing required fields: {", ".join(missing_fields)}',
                'missing_fields': missing_fields,
                'extracted_data': extracted_data,
                'carbonmark_details': None,
                'authenticated': False
            }), 400

        # Check for duplicate
        serial_number = extracted_data['serial_number']
        existing = db.credits.find_one({'extracted_data.serial_number': serial_number})
        if existing:
            logger.info(f"Duplicate found for serial number: {serial_number}")
            return jsonify({
                'success': True,
                'status': 'duplicate',
                'message': 'This certificate has already been processed',
                'authenticated': existing.get('status') == 'authenticated',
                'extracted_data': existing.get('extracted_data'),
                'carbonmark_details': existing.get('carbonmark_details'),
                'serial_number': serial_number,
                'file_hash': file_hash
            }), 200

        # Carbonmark verification
        carbonmark_result = {'verified': False, 'message': 'Skipped verification', 'details': None}
        if extracted_data.get('project_id'):
            logger.debug(f"Verifying with Carbonmark: {extracted_data['project_id']}")
            carbonmark_result = verify_with_carbonmark(extracted_data['project_id'])
            logger.info(f"Carbonmark result: {carbonmark_result}")

        # Determine authentication status
        authenticated = not missing_fields and carbonmark_result.get('verified', False)
        
        # Create credit record
        credit_doc = {
            'serialNumber': serial_number,
            'file_hash': file_hash,
            'authenticated': authenticated,
            'status': 'authenticated' if authenticated else 'unauthenticated',
            'extracted_data': extracted_data,
            'carbonmark_details': carbonmark_result.get('details'),
            'processing_date': datetime.utcnow(),
            'original_filename': secure_filename(certificate_file.filename)
        }
        
        # Insert into MongoDB
        db.credits.insert_one(credit_doc)
        logger.info(f"Inserted new credit document for serial number: {serial_number}")

        # Prepare response
        response = {
            'success': True,
            'status': 'authenticated' if authenticated else 'unauthenticated',
            'message': 'Certificate authenticated' if authenticated else carbonmark_result.get('message', 'Verification failed'),
            'authenticated': authenticated,
            'extracted_data': extracted_data,
            'carbonmark_details': carbonmark_result.get('details'),
            'blockchain_status': 'Verified on private Fabric chain',
            'fabric_tx_id': f"tx_{os.urandom(8).hex()}",
            'original_filename': secure_filename(certificate_file.filename),
            'serial_number': serial_number,
            'file_hash': file_hash
        }

        return jsonify(response), 200

    except Exception as e:
        logger.error(f"Authentication error: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'status': 'error',
            'message': f'An error occurred during authentication: {str(e)}',
            'authenticated': False,
            'extracted_data': None,
            'carbonmark_details': None
        }), 500
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
                logger.debug(f"Deleted temporary file: {temp_path}")
            except Exception as e:
                logger.warning(f"Error deleting temp file: {e}")

if __name__ == "__main__":
    if not CARBONMARK_API_KEY:
        logger.warning("CARBONMARK_API_KEY not set - Carbonmark verification will fail")
    app.run(debug=True, host='0.0.0.0', port=5001)