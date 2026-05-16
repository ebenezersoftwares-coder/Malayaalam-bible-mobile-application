<img width="1284" height="2778" alt="1" src="https://github.com/user-attachments/assets/9228faec-c675-4503-92e8-cd303f2abf2b" />
Bible App – README.md
📖 Overview

This is a simple HTML/CSS/JavaScript Bible App that can run:

In a web browser
Using a local HTTP server
Inside a Cordova mobile app
🚀 Project Structure
bible-app/
│
├── index.html
├── style.css
├── app.js
├── data/
│   └── bible.json
├── assets/
│   └── icons/
└── README.md
✅ Requirements

Install one of these:

Python 3
Node.js + npm
Cordova (optional for mobile app)
▶️ Run Using Python HTTP Server
Step 1 — Open Terminal

Navigate to your project folder:

cd bible-app
Step 2 — Start Server

Run:

python -m http.server 8000
Step 3 — Open in Browser

Visit:

http://localhost:8000
▶️ Run Using Node.js HTTP Server
Step 1 — Install Node.js

Download from:

Node.js Official Website

Verify installation:

node -v
npm -v
Step 2 — Install HTTP Server

Install globally:

npm install -g http-server
Step 3 — Navigate to Project Folder
cd bible-app
Step 4 — Start Server
npx http-server -p 8000
Step 5 — Open in Browser
http://localhost:8000
📱 Run as Cordova App
Step 1 — Install Cordova
npm install -g cordova

Official website:

Apache Cordova

Step 2 — Create Cordova Project
cordova create BibleApp com.example.bibleapp BibleApp
Step 3 — Open Project Folder
cd BibleApp
Step 4 — Replace www Folder Files

Copy these into the www folder:

index.html
style.css
app.js
data/
assets/

Example:

BibleApp/
└── www/
    ├── index.html
    ├── style.css
    ├── app.js
    ├── data/
    └── assets/
Step 5 — Add Android Platform
cordova platform add android
Step 6 — Build App
cordova build android
Step 7 — Run on Device

Connect Android phone with USB debugging enabled:

cordova run android
🛠 Useful Commands
Rebuild Cordova App
cordova build
Remove Android Platform
cordova platform remove android
Add Browser Platform
cordova platform add browser
Run in Browser
cordova run browser
🌙 Features
Bible book listing
Chapter navigation
Verse display
Responsive design
Dark/Light mode support
Offline JSON data support
📦 Recommended VS Code Extensions
Live Server
HTML CSS Support
JavaScript (ES6) code snippets

VS Code:

Visual Studio Code

⚠️ Common Issues
Port Already in Use

Use another port:

python -m http.server 9000

or

npx http-server -p 9000
Cordova Not Recognized

Restart terminal after installation or verify:

cordova -v
📄 License

Free to use for personal and educational projects
