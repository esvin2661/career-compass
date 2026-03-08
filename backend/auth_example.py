"""auth_example.py

Example Flask application demonstrating AWS Cognito integration using Authlib.
This file is provided as a reference; you can adapt the logic to FastAPI or
another framework as needed for the Career Compass project.

Instructions:
 1. Configure your Cognito user pool client with allowed callback/logout URLs
    and scopes (e.g. openid profile email).
 2. Install dependencies: authlib, werkzeug, flask, requests (see requirements.txt)
 3. Update the authority, client_id and client_secret below to match your pool.
 4. Run this file separately with `python auth_example.py` to test the flow.

"""

from flask import Flask, redirect, url_for, session
from authlib.integrations.flask_client import OAuth
import os

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Use a secure random key in production

# configure OAuth client for Cognito
oauth = OAuth(app)

oauth.register(
    name='oidc',
    authority='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_HDgrrnope',
    client_id='5vfbcoto2fjgdjkl5q9iffvppu',
    client_secret='<client secret>',
    server_metadata_url='https://cognito-idp.us-east-1.amazonaws.com/us-east-1_HDgrrnope/.well-known/openid-configuration',
    client_kwargs={'scope': 'phone openid email'}
)

# home page with login/logout links
@app.route('/')
def index():
    user = session.get('user')
    if user:
        return f'Hello, {user.get("email")}.' + \
               ' <a href="/logout">Logout</a>'
    else:
        return 'Welcome! Please <a href="/login">Login</a>.'

# login route redirects to Cognito-hosted UI
@app.route('/login')
def login():
    # you can redirect to /authorize instead; shown here for clarity
    return oauth.oidc.authorize_redirect('http://localhost:3001/')

# authorization callback, exchange token and save user
@app.route('/authorize')
def authorize():
    token = oauth.oidc.authorize_access_token()
    user = token.get('userinfo')
    session['user'] = user
    return redirect(url_for('index'))

# logout clears session and redirects home
@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)
