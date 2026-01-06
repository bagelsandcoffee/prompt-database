import os
import ast
import subprocess
import requests
import json

# Configuration
API_ENDPOINT = "https://models.github.ai/inference/chat/completions"
MODEL_NAME = "gpt-4o"
TOKEN = os.environ.get("GITHUB_TOKEN")

def get_changed_python_files():
    """Get list of .py files changed in the PR."""
    cmd = ["git", "diff", "--name-only", "HEAD^", "HEAD"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return [f for f in result.stdout.splitlines() if f.endswith('.py') and os.path.exists(f)]

def get_function_source(file_content, node):
    """Extracts the raw source code of a specific function node."""
    lines = file_content.splitlines()
    # node.lineno is 1-indexed, so subtract 1
    # node.end_lineno covers the whole block
    return "\n".join(lines[node.lineno - 1 : node.end_lineno])

def generate_docstring_text(function_code):
    """Asks AI for just the docstring text (Google Style)."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKEN}"
    }
    
    # Strict prompt to get ONLY the docstring content
    prompt = (
        "Write a Google-style docstring for this Python function. "
        "Return ONLY the raw string content (no quotes, no code blocks). "
        "Do not include the function signature.\n\n"
        f"Code:\n{function_code}"
    )

    payload = {
        "messages": [
            {"role": "system", "content": "You are a precise technical documentation assistant."},
            {"role": "user", "content": prompt}
        ],
        "model": MODEL_NAME,
        "temperature": 0.1
    }

    try:
        response = requests.post(API_ENDPOINT, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()['choices'][0]['message']['content'].strip('`"\'')
    except Exception as e:
        print(f"  [Error] AI Request failed: {e}")
        return None

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    try:
        tree = ast.parse(content)
    except SyntaxError:
        print(f"  [Skipping] Syntax Error in {file_path}")
        return

    # 1. Identify all functions missing docstrings
    missing_docs = []
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            if ast.get_docstring(node) is None:
                missing_docs.append(node)

    if not missing_docs:
        print(f"  [OK] No missing docstrings in {file_path}")
        return

    print(f"  [Update] Found {len(missing_docs)} missing docstrings in {file_path}")
    
    # 2. Iterate in REVERSE line order 
    # (Crucial: Inserting lines from bottom up prevents shifting line numbers for earlier nodes)
    missing_docs.sort(key=lambda x: x.lineno, reverse=True)
    
    file_lines = content.splitlines()
    
    for node in missing_docs:
        func_name = node.name
        print(f"    - Generating for '{func_name}'...")
        
        # Get source to send to AI
        func_source = get_function_source(content, node)
        doc_text = generate_docstring_text(func_source)
        
        if not doc_text:
            continue

        # 3. Calculate Insertion Point
        # The body starts at the line of the first statement
        body_start_lineno = node.body[0].lineno - 1 # Convert to 0-index
        
        # Get indentation of the first statement to match it
        first_stmt_line = file_lines[body_start_lineno]
        indentation = first_stmt_line[:len(first_stmt_line) - len(first_stmt_line.lstrip())]
        
        # Format the docstring
        docstring_block = f'{indentation}"""\n'
        for line in doc_text.splitlines():
            docstring_block += f'{indentation}{line}\n'
        docstring_block += f'{indentation}"""'
        
        # Insert into list
        file_lines.insert(body_start_lineno, docstring_block)

    # 4. Save file back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(file_lines))

def main():
    print("Starting AI Docstring Generator...")
    changed_files = get_changed_python_files()
    
    if not changed_files:
        print("No Python files changed.")
        return

    for file in changed_files:
        process_file(file)

if __name__ == "__main__":
    main()