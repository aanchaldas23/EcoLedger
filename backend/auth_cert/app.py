from flask import Flask, request, jsonify
from PyPDF2 import PdfReader
import re
import requests
from dotenv import load_dotenv, find_dotenv
import os
from flask_cors import CORS
from pymongo import MongoClient
from datetime import datetime
from bson import ObjectId # Required for MongoDB _id conversion

# Find the .env file in the parent directory (backend/) relative to auth_cert/
dotenv_path = find_dotenv('../.env')

if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"DEBUG: Successfully loaded .env from: {dotenv_path}")
else:
    # If the .env file in the parent directory is not found,
    # try loading from the current directory (auth_cert/.env) just in case.
    load_dotenv()
    print("DEBUG: .env file not found at '../.env'. Attempting to load from current directory.")

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# --- Configuration from .env ---
CARBONMARK_API_KEY = os.getenv("CARBONMARK_API_KEY")
CARBONMARK_API_BASE_URL = os.getenv("CARBONMARK_API_BASE_URL", "https://api.carbonmark.com")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DATABASE_NAME = os.getenv("DATABASE_NAME", "greencredits")

print(f"DEBUG: MONGO_URI after load_dotenv: {MONGO_URI}")
print(f"DEBUG: DATABASE_NAME after load_dotenv: {DATABASE_NAME}")

# --- MongoDB setup ---
db = None # Initialize db to None
client = None # Initialize client to None
try:
    client = MongoClient(MONGO_URI)
    db = client[DATABASE_NAME]
    # Test connection by running a simple command
    client.admin.command('ping')
    print("✅ MongoDB connection successful in Flask app")
except Exception as e:
    print(f"❌ MongoDB connection failed in Flask app: {e}")
    # If connection fails, db remains None, and routes will handle it

# --- Regex patterns for PDF text extraction ---
PATTERNS = {
    'serial_number': r"[Ss]erial [Nn]umber:\s*([A-Za-z0-9\-Α]+)",
    'project_id': r"[Pp]roject\s+[Ii][Dd]:\s*([A-Za-z0-9\-]+)",
    'project_name': r"[Pp]roject\s+[Nn]ame:\s*(.+)",
    'vintage': r"[Vv]intage:\s*(\d{4})",
    'amount': r"[Aa]mount.*?:\s*([\d,\.]+)",
    'issuance_date': r"[Ii]ssuance [Dd]ate:\s*(\d{2}/\d{2}/\d{4}|\d{4}-\d{2}-\d{2})",
    'registry': r"[Rr]egistry:\s*([A-Za-z0-9\-]+)",
    'category': r"[Cc]ategory:\s*([A-Za-z\s\(\)\+\-]+)",
    'issued_to': r"[Ii]ssued [Tt]o:\s*(.+)",
}

# --- Utility Functions ---
def extract_text_from_pdf(pdf_path):
    """
    Extracts all text from a PDF file.
    Args:
        pdf_path (str): The file path to the PDF.
    Returns:
        str: All extracted text, or None if an error occurs.
    """
    try:
        reader = PdfReader(pdf_path)
        text = ''.join(page.extract_text() or "" for page in reader.pages)
        return text
    except Exception as e:
        app.logger.error(f"Error extracting text from PDF at {pdf_path}: {e}")
        return None

def parse_certificate_data(text):
    """
    Parses extracted text to find certificate details using regex patterns.
    Args:
        text (str): The full text extracted from the PDF.
    Returns:
        dict: A dictionary of extracted fields.
    """
    extracted_data = {}
    for key, pattern in PATTERNS.items():
        match = re.search(pattern, text)
        if match:
            value = match.group(1).strip()
            if key == 'amount':
                value = value.replace(',', '') # Remove commas
                try:
                    value = float(value)
                except ValueError:
                    pass # Keep as string if conversion fails
            extracted_data[key] = value
        else:
            extracted_data[key] = None # Field not found
    return extracted_data

def verify_with_carbonmark(project_id):
    """
    Verifies a project ID against the Carbonmark API using multiple strategies.
    Tries search, direct lookup, and checking within product bundles.
    Args:
        project_id (str): The project ID to verify.
    Returns:
        dict: A dictionary indicating verification status, message, and details.
    """
    if not CARBONMARK_API_KEY:
        print("[ERROR] CARBONMARK_API_KEY is not set. Cannot perform Carbonmark verification.")
        return {'verified': False, 'message': 'Carbonmark API key missing.', 'details': None}

    headers = {'Authorization': f'Bearer {CARBONMARK_API_KEY}'}
    normalized_id = project_id.strip().upper()
    print(f"[VERIFY] Verifying project ID: {normalized_id} using Carbonmark API")
    print(f"[VERIFY] Using CARBONMARK_API_BASE_URL: {CARBONMARK_API_BASE_URL}")

    try:
        # Step 1: Try search via /carbonProjects
        search_url = f"{CARBONMARK_API_BASE_URL}/carbonProjects"
        print(f"[VERIFY] Attempting search: {search_url} with param search='{normalized_id}'")
        search_resp = requests.get(
            search_url,
            headers=headers,
            params={'search': normalized_id},
            timeout=10
        )
        search_resp.raise_for_status()
        projects = search_resp.json()
        print(f"[DEBUG] Search Response (carbonProjects): {projects}")

        if isinstance(projects, dict) and "items" in projects:
            projects = projects["items"]
        elif not isinstance(projects, list):
            print(f"[ERROR] Unexpected search response format for /carbonProjects: {type(projects)}")
            projects = []

        for p in projects:
            p_key = p.get('key', '').strip().upper()
            p_id = p.get('projectID', '').strip().upper()
            print(f"[SEARCH] Checking Project key: '{p_key}' | projectID: '{p_id}'")
            if p_key == normalized_id or p_id == normalized_id:
                print(f"[MATCH] Project '{normalized_id}' found via /carbonProjects search.")
                return {
                    'verified': True,
                    'message': 'Found via /carbonProjects search',
                    'details': {
                        'id': p.get('key'),
                        'name': p.get('name'),
                        'country': p.get('country'),
                        'vintages': p.get('vintages'),
                        'methodologies': p.get('methodologies')
                    }
                }

        # Step 2: Try direct lookup via /carbonProjects/{project_id}
        direct_url = f"{CARBONMARK_API_BASE_URL}/carbonProjects/{normalized_id}"
        print(f"[VERIFY] Attempting direct lookup: {direct_url}")
        direct_resp = requests.get(
            direct_url,
            headers=headers,
            timeout=10
        )
        if direct_resp.status_code == 200:
            p = direct_resp.json()
            print(f"[DEBUG] Direct Lookup Response: {p}")
            print(f"[DIRECT] Found {p.get('key')}")
            return {
                'verified': True,
                'message': 'Found via direct project ID lookup',
                'details': {
                    'id': p.get('key'),
                    'name': p.get('name'),
                    'country': p.get('country'),
                    'vintages': p.get('vintages'),
                    'methodologies': p.get('methodologies')
                }
            }
        else:
            print(f"[DEBUG] Direct Lookup failed with status {direct_resp.status_code}: {direct_resp.text}")

        # Step 3: Check bundles via /products
        products_url = f"{CARBONMARK_API_BASE_URL}/products"
        print(f"[VERIFY] Attempting products lookup: {products_url}")
        product_resp = requests.get(
            products_url,
            headers=headers,
            timeout=10
        )
        product_resp.raise_for_status()
        products_data = product_resp.json()
        print(f"[DEBUG] Products Response: {products_data}")

        if isinstance(products_data, dict) and "items" in products_data:
            products_data = products_data["items"]
        elif not isinstance(products_data, list):
            print(f"[ERROR] Unexpected products response format for /products: {type(products_data)}")
            products_data = []

        for product in products_data:
            project_ids = [str(pid).strip().upper() for pid in product.get("projectIds", [])]
            print(f"[BUNDLE] Checking product '{product.get('name')}' (ID: {product.get('id')}) for project IDs: {project_ids}")
            if normalized_id in project_ids:
                print(f"[MATCHED] Project '{normalized_id}' found in bundle: {product.get('name')}")
                return {
                    'verified': True,
                    'message': f"Found in Carbonmark bundle: {product.get('name')}",
                    'details': {
                        'id': normalized_id,
                        'name': product.get('name'),
                        'type': "bundle",
                        'description': product.get('short_description'),
                        'source': product.get('url'),
                        'coverImage': product.get('coverImage', {}).get('url')
                    }
                }

        print(f"[NOT FOUND] Project ID '{normalized_id}' not found in Carbonmark projects or bundles.")
        return {'verified': False, 'message': 'Project not found in Carbonmark.', 'details': None}

    except requests.exceptions.HTTPError as e:
        print(f"[ERROR] HTTP Error connecting to Carbonmark API: {e.response.status_code} {e.response.text} for url: {e.request.url}")
        return {'verified': False, 'message': f'HTTP error: {e.response.status_code} - {e.response.text}', 'details': None}
    except requests.exceptions.ConnectionError as e:
        print(f"[ERROR] Connection Error connecting to Carbonmark API: {e}")
        return {'verified': False, 'message': f'Connection error: {e}', 'details': None}
    except requests.exceptions.Timeout as e:
        print(f"[ERROR] Timeout Error connecting to Carbonmark API: {e}")
        return {'verified': False, 'message': f'Timeout error: {e}', 'details': None}
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] General Request Error connecting to Carbonmark API: {e}")
        return {'verified': False, 'message': f'Request error: {e}', 'details': None}
    except Exception as e:
        print(f"[ERROR] Unexpected error in verify_with_carbonmark: {e}")
        return {'verified': False, 'message': f'Unexpected error: {e}', 'details': None}

# --- Routes ---

@app.route('/api/authenticate', methods=['POST'])
def authenticate_certificate():
    """
    Authenticates a carbon credit certificate by extracting data from a PDF,
    verifying it with the Carbonmark API, and returning the results.
    """
    if 'certificate' not in request.files:
        return jsonify({'authenticated': False, 'status': 'failed', 'message': 'No certificate uploaded'}), 400

    certificate_file = request.files['certificate']
    if certificate_file.filename == '':
        return jsonify({'authenticated': False, 'status': 'failed', 'message': 'Empty filename'}), 400

    temp_path = f"/tmp/{certificate_file.filename}_{datetime.now().timestamp()}"
    try:
        certificate_file.save(temp_path)

        pdf_text = extract_text_from_pdf(temp_path)
        if not pdf_text:
            return jsonify({'authenticated': False, 'status': 'failed', 'message': 'Could not extract text from PDF. Is it a searchable PDF?'}), 400

        extracted_data = parse_certificate_data(pdf_text)

        print("[DEBUG] Extracted Fields:")
        for f in ['serial_number', 'project_id', 'amount', 'registry', 'project_name', 'vintage', 'issuance_date', 'category', 'issued_to']:
            print(f"  {f}: {extracted_data.get(f)}")

        required_fields = ['serial_number', 'project_id', 'amount', 'registry']
        missing_fields = [f for f in required_fields if not extracted_data.get(f)]
        is_extracted_valid = len(missing_fields) == 0
        print("[DEBUG] Missing required fields:", missing_fields)

        carbonmark_verification_result = {'verified': False, 'message': 'Skipped verification (no project ID).', 'details': None}
        if extracted_data.get('project_id'):
            carbonmark_verification_result = verify_with_carbonmark(extracted_data['project_id'])

        print("[DEBUG] Carbonmark verified:", carbonmark_verification_result['verified'])

        authenticated = is_extracted_valid and carbonmark_verification_result['verified']
        final_status = "authenticated" if authenticated else "unauthenticated"
        message = "Certificate successfully authenticated." if authenticated else "Authentication failed."
        if not is_extracted_valid:
            message += f" Missing essential data: {', '.join(missing_fields)}."
        elif not carbonmark_verification_result['verified']:
            message += f" Carbonmark verification failed: {carbonmark_verification_result['message']}."

        response = {
            'authenticated': authenticated,
            'status': final_status,
            'message': message,
            'extracted_data': extracted_data,
            'carbonmark_details': carbonmark_verification_result['details'],
            'blockchain_status': 'Verified on private Fabric chain (placeholder)',
            'fabric_tx_id': 'txid_xyz123abc456 (placeholder)',
            'original_filename': certificate_file.filename
        }

        return jsonify(response), 200

    except Exception as e:
        app.logger.error(f"Unhandled error in /authenticate: {e}")
        return jsonify({'authenticated': False, 'status': 'error', 'message': f'An internal server error occurred during authentication: {str(e)}'}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.route('/api/marketplace/list', methods=['POST'])
def list_on_marketplace():
    """
    Lists a carbon credit on the marketplace.
    Receives extracted data and listing details, stores in MongoDB.
    """
    if db is None:
        return jsonify({'error': 'Database not available in Flask'}), 500

    try:
        data = request.get_json()

    # In app.py, inside the list_on_marketplace function

        # Validate required fields
        required_fields_for_listing = ['serial_number', 'project_id', 'project_name', 'amount', 'price_per_credit']
        for field in required_fields_for_listing:
            # For required fields, if they are not in data or their value is None/empty string, it's an error.
            if field not in data or (data[field] is None or (isinstance(data[field], str) and not data[field].strip())):
                return jsonify({'error': f'Missing required field for listing: {field}'}), 400
        
        # Validate 'price_per_credit' type explicitly
        if 'price_per_credit' in data:
            try:
                data['price_per_credit'] = float(data['price_per_credit'])
            except (ValueError, TypeError):
                return jsonify({'error': 'price_per_credit must be a valid number.'}), 400
            if data['price_per_credit'] <= 0:
                return jsonify({'error': 'price_per_credit must be a positive number.'}), 400

        # Validate 'total_value' type if provided
        if 'total_value' in data and data['total_value'] is not None:
            try:
                data['total_value'] = float(data['total_value'])
            except (ValueError, TypeError):
                return jsonify({'error': 'total_value must be a valid number.'}), 400
            if data['total_value'] <= 0:
                return jsonify({'error': 'total_value must be a positive number.'}), 400


        # Create marketplace listing document
        listing_doc = {
            # Certificate Information
            'serial_number': data['serial_number'],
            'project_id': data['project_id'],
            'project_name': data['project_name'],
            'vintage': data.get('vintage'),
            'amount': float(data['amount']),
            'issuance_date': data.get('issuance_date'),
            'registry': data.get('registry'),
            'category': data.get('category'),
            'issued_to': data.get('issued_to'),

            # Carbonmark Verification Details
            'carbonmark_details': data.get('carbonmark_details'), # Store the whole object

            # Blockchain Information
            'blockchain_status': data.get('blockchain_status'),
            'fabric_tx_id': data.get('fabric_tx_id'),

            # Marketplace Listing Information - Directly use price_per_credit and calculate total_value
            'price_per_credit': data['price_per_credit'],
            'total_value': data.get('total_value'), # Use provided total_value if available
            
            'listing_description': data.get('listing_description', ''),
            'listed_date': datetime.utcnow(),
            'status': 'available',
            'is_active': True,
            'listed_by_user_id': data.get('user_id', 'anonymous_user'),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        # If total_value was not provided by the frontend, calculate it now
        if listing_doc['total_value'] is None and listing_doc['price_per_credit'] is not None and listing_doc['amount'] is not None:
            listing_doc['total_value'] = listing_doc['price_per_credit'] * listing_doc['amount']


        # Insert into marketplace_listings collection
        result = db.marketplace_listings.insert_one(listing_doc)

        return jsonify({
            'success': True,
            'message': 'Credit successfully listed on marketplace!',
            'listing_id': str(result.inserted_id),
            'listing_data': {
                'id': str(result.inserted_id),
                'serial_number': data['serial_number'],
                'project_name': data['project_name'],
                'amount': float(data['amount']),
                'price_per_credit': listing_doc['price_per_credit'],
                'total_value': listing_doc['total_value'],
                'status': 'available',
                'listed_date': listing_doc['listed_date'].isoformat()
            }
        }), 200

    except Exception as e:
        print(f"Error listing credit on marketplace: {str(e)}")
        app.logger.error(f"Error listing credit on marketplace: {e}")
        return jsonify({'error': 'Failed to list credit on marketplace', 'details': str(e)}), 500

@app.route('/api/marketplace/listings', methods=['GET'])
def get_marketplace_listings():
    """Get all available marketplace listings"""
    if db is None:
        return jsonify({'error': 'Database not available'}), 500

    try:
        status = request.args.get('status', 'available')
        limit = int(request.args.get('limit', 20))
        offset = int(request.args.get('offset', 0))

        query = {'status': status} if status != 'all' else {}
        query['is_active'] = True

        listings = list(db.marketplace_listings.find(query)
                        .sort('listed_date', -1)
                        .skip(offset)
                        .limit(limit))

        for listing in listings:
            listing['_id'] = str(listing['_id'])
            if 'listed_date' in listing and isinstance(listing['listed_date'], datetime):
                listing['listed_date'] = listing['listed_date'].isoformat()
            if 'created_at' in listing and isinstance(listing['created_at'], datetime):
                listing['created_at'] = listing['created_at'].isoformat()
            if 'updated_at' in listing and isinstance(listing['updated_at'], datetime):
                listing['updated_at'] = listing['updated_at'].isoformat()

        return jsonify({
            'success': True,
            'listings': listings,
            'total': len(listings),
            'offset': offset,
            'limit': limit
        }), 200

    except Exception as e:
        print(f"Error fetching marketplace listings: {str(e)}")
        app.logger.error(f"Error fetching marketplace listings: {e}")
        return jsonify({'error': 'Failed to fetch marketplace listings', 'details': str(e)}), 500

@app.route('/api/marketplace/listings/<listing_id>', methods=['GET'])
def get_marketplace_listing(listing_id):
    """Get a specific marketplace listing by its ID"""
    if db is None:
        return jsonify({'error': 'Database not available'}), 500

    try:
        listing = db.marketplace_listings.find_one({'_id': ObjectId(listing_id)})

        if not listing:
            return jsonify({'error': 'Listing not found'}), 404

        listing['_id'] = str(listing['_id'])
        if 'listed_date' in listing and isinstance(listing['listed_date'], datetime):
            listing['listed_date'] = listing['listed_date'].isoformat()
        if 'created_at' in listing and isinstance(listing['created_at'], datetime):
            listing['created_at'] = listing['created_at'].isoformat()
        if 'updated_at' in listing and isinstance(listing['updated_at'], datetime):
            listing['updated_at'] = listing['updated_at'].isoformat()

        return jsonify({
            'success': True,
            'listing': listing
        }), 200

    except Exception as e:
        print(f"Error fetching marketplace listing: {str(e)}")
        app.logger.error(f"Error fetching marketplace listing: {e}")
        return jsonify({'error': 'Failed to fetch marketplace listing', 'details': str(e)}), 500

@app.route('/api/marketplace/listings/<listing_id>', methods=['PUT'])
def update_marketplace_listing(listing_id):
    """Update a marketplace listing"""
    if db is None:
        return jsonify({'error': 'Database not available'}), 500

    try:
        data = request.get_json()

        update_doc = {
            'updated_at': datetime.utcnow()
        }

        allowed_fields = ['price_per_credit', 'listing_description', 'status', 'is_active', 'price_type', 'total_value'] # Added total_value here
        for field in allowed_fields:
            if field in data:
                update_doc[field] = data[field]

        # Recalculate total value if price_per_credit changed AND total_value not explicitly provided
        # or if price_type changed to fixed AND total_value not explicitly provided
        if ('price_per_credit' in data and 'total_value' not in data) or \
           ('price_type' in data and data['price_type'] == 'fixed' and 'total_value' not in data):
            listing = db.marketplace_listings.find_one({'_id': ObjectId(listing_id)})
            if listing and 'amount' in listing:
                current_price_per_credit = data.get('price_per_credit', listing.get('price_per_credit'))
                if current_price_per_credit is not None:
                    update_doc['total_value'] = float(current_price_per_credit) * float(listing['amount'])
                else:
                    update_doc['total_value'] = None
            elif 'price_type' in data and data['price_type'] == 'negotiation':
                update_doc['price_per_credit'] = None
                update_doc['total_value'] = None


        result = db.marketplace_listings.update_one(
            {'_id': ObjectId(listing_id)},
            {'$set': update_doc}
        )

        if result.matched_count == 0:
            return jsonify({'error': 'Listing not found'}), 404

        return jsonify({
            'success': True,
            'message': 'Listing updated successfully',
            'updated_fields': list(update_doc.keys())
        }), 200

    except Exception as e:
        print(f"Error updating marketplace listing: {str(e)}")
        app.logger.error(f"Error updating marketplace listing: {e}")
        return jsonify({'error': 'Failed to update marketplace listing', 'details': str(e)}), 500

@app.route('/api/marketplace/listings/<listing_id>', methods=['DELETE'])
def delete_marketplace_listing(listing_id):
    """Delete a marketplace listing (or mark as inactive)"""
    if db is None:
        return jsonify({'error': 'Database not available'}), 500

    try:
        result = db.marketplace_listings.update_one(
            {'_id': ObjectId(listing_id)},
            {'$set': {'status': 'deleted', 'is_active': False, 'updated_at': datetime.utcnow()}}
        )

        if result.matched_count == 0:
            return jsonify({'error': 'Listing not found'}), 404

        return jsonify({
            'success': True,
            'message': 'Listing marked as deleted/inactive successfully'
        }), 200

    except Exception as e:
        print(f"Error deleting marketplace listing: {str(e)}")
        app.logger.error(f"Error deleting marketplace listing: {e}")
        return jsonify({'error': 'Failed to delete marketplace listing', 'details': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint for the Flask application"""
    db_status = 'disconnected'
    try:
        if client:
            client.admin.command('ping')
            db_status = 'connected'
    except Exception:
        db_status = 'disconnected'

    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'database': db_status,
        'carbonmark_api_key_set': bool(CARBONMARK_API_KEY)
    }), 200

if __name__ == "__main__":
    if not CARBONMARK_API_KEY:
        print("WARNING: CARBONMARK_API_KEY not found in .env. Carbonmark verification will be skipped or fail.")
    if not CARBONMARK_API_BASE_URL:
        print("WARNING: CARBONMARK_API_BASE_URL not found in .env. Defaulting to https://api.carbonmark.com.")

    app.run(debug=True, port=5001)