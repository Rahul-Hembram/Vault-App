# 🔐 SecureVault — Multimedia Content Protection System

SecureVault is a full-stack multimedia content protection and secure file management application. It provides users with a private dashboard to upload, manage, organize, encrypt, preview, and download their files securely.

Built using React, Vite, Express.js, and SQLite, SecureVault combines a modern dashboard with server-side authentication, AES-256-GCM encryption, and activity monitoring.

> **Note:** SecureVault is a local-first software engineering lab project intended for demonstration and learning purposes.

---

## ✨ Features

- 🔐 Secure user registration and login
- 🔑 Password hashing using bcrypt
- 📁 Secure multimedia file uploads
- 🛡️ AES-256-GCM file encryption
- 🔒 Private file storage outside the public web directory
- 🔍 File search, filtering, and sorting
- 📥 Secure file preview and download
- 🗑️ File copy and deletion
- 📊 Dashboard analytics and storage statistics
- 📜 Security activity logs
- 📄 CSV export of activity logs
- 🚨 Temporary security lockout after repeated failed password attempts
- 🌙 Dark and light themes
- 📱 Responsive user interface

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| React.js | Frontend |
| Vite | Development and build tool |
| Node.js | Runtime environment |
| Express.js | Backend API |
| SQLite | Database |
| bcrypt | Password hashing |
| AES-256-GCM | File encryption |
| JWT | Authentication |
| CSS | UI styling |

---

## 📸 Application Screenshots

### Dashboard

![Dashboard](./Screenshot%202026-11-24%20222237.png)

### Application Overview

![Screenshot 2](./Screenshot%202026-11-24%20222318.png)

![Screenshot 3](./Screenshot%202026-11-24%20222339.png)

![Screenshot 4](./Screenshot%202026-11-24%20222350.png)

![Screenshot 5](./Screenshot%202026-11-24%20222402.png)

![Screenshot 6](./Screenshot%202026-11-24%20222418.png)

![Screenshot 7](./Screenshot%202026-11-24%20222424.png)

![Screenshot 8](./Screenshot%202026-11-24%20222448.png)

---

## 📁 Project Structure

```text
Vault-App/
│
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js
│   │   └── security.js
│   ├── test/
│   ├── data/
│   ├── storage/
│   └── .env.example
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── styles.css
│   └── vite.config.js
│
├── .gitignore
├── package.json
└── README.md
