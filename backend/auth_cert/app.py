from flask import Flask, request, jsonify
from PyPDF2 import PdfReader
import re
import requests
from dotenv import load_dotenv
import os
from flask_cors import CORS

load_dotenv()
app = Flask(__name__)
CORS(app)

CARBONMARK_API_KEY = os.getenv("CARBONMARK_API_KEY")
CARBONMARK_API_BASE_URL = os.getenv("CARBONMARK_API_BASE_URL", "https://api.carbonmark.com")

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
    try:
        reader = PdfReader(pdf_path)
        return ''.join(page.extract_text() or "" for page in reader.pages)
    except Exception as e:
        app.logger.error(f"Error extracting text from PDF: {e}")
        return None

def parse_certificate_data(text):
    extracted_data = {}
    for key, pattern in PATTERNS.items():
        match = re.search(pattern, text)
        if match:
            value = match.group(1).strip()
            if key == 'amount':
                value = value.replace(',', '')
                try:
                    value = float(value)
                except ValueError:
                    pass
            extracted_data[key] = value
        else:
            extracted_data[key] = None
    return extracted_data

def verify_with_carbonmark(project_id):
    headers = {'Authorization': f'Bearer {CARBONMARK_API_KEY}'}
    normalized_id = project_id.strip().upper()
    print(f"[VERIFY] Verifying project ID: {normalized_id} using /carbonProjects and /products")
    print(f"[VERIFY] Using CARBONMARK_API_BASE_URL: {CARBONMARK_API_BASE_URL}") # <--- ADDED THIS LINE

    try:
        # Step 1: Try search via /carbonProjects
        search_url = f"{CARBONMARK_API_BASE_URL}/carbonProjects"
        print(f"[VERIFY] Attempting search: {search_url} with param search='{normalized_id}'") # <--- MODIFIED THIS LINE
        search_resp = requests.get(
            search_url,
            headers=headers,
            params={'search': normalized_id},
            timeout=10
        )
        search_resp.raise_for_status() # This will raise an HTTPError for 4xx/5xx responses
        projects = search_resp.json()
        print(f"[DEBUG] Search Response (carbonProjects): {projects}") # <--- ADDED THIS LINE

        # Carbonmark API sometimes returns a dict with "items" key, sometimes a direct list
        if isinstance(projects, dict) and "items" in projects:
            projects = projects["items"]
        elif not isinstance(projects, list):
            print(f"[ERROR] Unexpected search response format for /carbonProjects: {type(projects)}")
            projects = []

        for p in projects:
            print(f"[SEARCH] Project {p.get('key')} | ID: {p.get('projectID')}") # <--- MODIFIED THIS LINE
            if p.get('key', '').strip().upper() == normalized_id or p.get('projectID', '').strip().upper() == normalized_id:
                print(f"[MATCH] Project {normalized_id} found via /carbonProjects search.") # <--- ADDED THIS LINE
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
        print(f"[VERIFY] Attempting direct lookup: {direct_url}") # <--- ADDED THIS LINE
        direct_resp = requests.get(
            direct_url,
            headers=headers,
            timeout=10
        )
        if direct_resp.status_code == 200:
            p = direct_resp.json()
            print(f"[DEBUG] Direct Lookup Response: {p}") # <--- ADDED THIS LINE
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
            print(f"[DEBUG] Direct Lookup failed with status {direct_resp.status_code}: {direct_resp.text}") # <--- MODIFIED THIS LINE

        # Step 3: Check bundles via /products
        products_url = f"{CARBONMARK_API_BASE_URL}/products"
        print(f"[VERIFY] Attempting products lookup: {products_url}") # <--- ADDED THIS LINE
        product_resp = requests.get(
            products_url,
            headers=headers,
            timeout=10
        )
        product_resp.raise_for_status()
        products_data = product_resp.json()
        print(f"[DEBUG] Products Response: {products_data}") # <--- ADDED THIS LINE

        # Carbonmark API /products sometimes returns a dict with "items" key, sometimes a direct list
        if isinstance(products_data, dict) and "items" in products_data:
            products_data = products_data["items"]
        elif not isinstance(products_data, list):
            print(f"[ERROR] Unexpected products response format for /products: {type(products_data)}")
            products_data = [] # Fallback if format is totally unexpected


        for product in products_data:
            # Ensure project_ids are consistently strings for comparison
            project_ids = [str(pid).strip().upper() for pid in product.get("projectIds", [])] # <--- MODIFIED THIS LINE
            print(f"[BUNDLE] Checking product '{product.get('name')}' (ID: {product.get('id')}) for project IDs: {project_ids}") # <--- MODIFIED THIS LINE
            if normalized_id in project_ids:
                print(f"[MATCHED] Project '{normalized_id}' found in bundle: {product.get('name')}") # <--- MODIFIED THIS LINE
                return {
                    'verified': True,
                    'message': f"Found in Carbonmark bundle: {product.get('name')}",
                    'details': {
                        'id': normalized_id, # Use normalized_id as the ID for the found project
                        'name': product.get('name'),
                        'type': "bundle",
                        'description': product.get('short_description'),
                        'source': product.get('url'),
                        'coverImage': product.get('coverImage', {}).get('url')
                    }
                }

        print(f"[NOT FOUND] Project ID '{normalized_id}' not found in Carbonmark projects or bundles.") # <--- MODIFIED THIS LINE
        return {'verified': False, 'message': 'Project not found in Carbonmark.', 'details': None}

    except requests.exceptions.HTTPError as e:
        print(f"[ERROR] HTTP Error connecting to Carbonmark API: {e.response.status_code} {e.response.text} for url: {e.request.url}") # <--- MODIFIED THIS LINE
        return {'verified': False, 'message': f'HTTP error: {e.response.status_code} - {e.response.text}', 'details': None}
    except requests.exceptions.ConnectionError as e:
        print(f"[ERROR] Connection Error connecting to Carbonmark API: {e}") # <--- MODIFIED THIS LINE
        return {'verified': False, 'message': f'Connection error: {e}', 'details': None}
    except requests.exceptions.Timeout as e:
        print(f"[ERROR] Timeout Error connecting to Carbonmark API: {e}") # <--- MODIFIED THIS LINE
        return {'verified': False, 'message': f'Timeout error: {e}', 'details': None}
    except requests.exceptions.RequestException as e:
        print(f"[ERROR] General Request Error connecting to Carbonmark API: {e}") # <--- MODIFIED THIS LINE
        return {'verified': False, 'message': f'Request error: {e}', 'details': None}
    except Exception as e:
        print(f"[ERROR] Unexpected error in verify_with_carbonmark: {e}") # <--- MODIFIED THIS LINE
        return {'verified': False, 'message': f'Unexpected error: {e}', 'details': None}


@app.route('/authenticate', methods=['POST'])
def authenticate_certificate():
    if 'certificate' not in request.files:
        return jsonify({'authenticated': False, 'status': 'failed', 'message': 'No certificate uploaded'}), 400

    certificate_file = request.files['certificate']
    if certificate_file.filename == '':
        return jsonify({'authenticated': False, 'status': 'failed', 'message': 'Empty filename'}), 400

    temp_path = f"/tmp/{certificate_file.filename}"
    try:
        certificate_file.save(temp_path)

        pdf_text = extract_text_from_pdf(temp_path)
        if not pdf_text:
            return jsonify({'authenticated': False, 'status': 'failed', 'message': 'Could not extract text from PDF'}), 400

        extracted_data = parse_certificate_data(pdf_text)

        print("[DEBUG] Extracted Fields:")
        for f in ['serial_number', 'project_id', 'amount', 'registry']:
            print(f"  {f}: {extracted_data.get(f)}")

        required_fields = ['serial_number', 'project_id', 'amount', 'registry']
        missing = [f for f in required_fields if not extracted_data.get(f)]
        is_extracted_valid = len(missing) == 0
        print("[DEBUG] Missing fields:", missing)

        carbonmark_verification_result = {'verified': False, 'message': 'Skipped verification.', 'details': None}
        if extracted_data.get('project_id'):
            carbonmark_verification_result = verify_with_carbonmark(extracted_data['project_id'])

        print("[DEBUG] Carbonmark verified:", carbonmark_verification_result['verified'])

        authenticated = is_extracted_valid and carbonmark_verification_result['verified']
        final_status = "authenticated" if authenticated else "unauthenticated"
        message = "Certificate successfully authenticated." if authenticated else "Authentication failed."

        response = {
            'authenticated': authenticated,
            'status': final_status,
            'message': message,
            'extracted_data': extracted_data,
            'carbonmark_details': carbonmark_verification_result['details'],
            'blockchain_status': 'Verified on private Fabric chain (placeholder)',
            'fabric_tx_id': 'txid_xyz123abc456 (placeholder)'
        }

        return jsonify(response), 200

    except Exception as e:
        app.logger.error(f"Unhandled error: {e}")
        return jsonify({'authenticated': False, 'status': 'error', 'message': str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    app.run(debug=True, port=5001)