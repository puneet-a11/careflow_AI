
# CareFlow AI 🏥

### AI-Powered Hospital Management System

CareFlow AI is a hospital management application designed to help healthcare organizations manage patient records, appointments, doctors, departments, laboratory workflows, prescriptions, billing, and other hospital operations through a centralized interface.

The project combines a web-based frontend, a FastAPI backend, a database layer, and an AI assistant powered by Google's Gemini API.

> **Project status:** Under development. Features, integrations, and deployment configuration may change as development continues.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [System Requirements](#-system-requirements)
- [Installation and Setup](#-installation-and-setup)
- [Environment Configuration](#-environment-configuration)
- [Running the Application](#-running-the-application)
- [API Documentation](#-api-documentation)
- [Database](#-database)
- [AI Assistant Setup](#-ai-assistant-setup)
- [Frontend and Backend Integration](#-frontend-and-backend-integration)
- [Security Considerations](#-security-considerations)
- [Troubleshooting](#-troubleshooting)
- [Future Improvements](#-future-improvements)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

CareFlow AI aims to simplify hospital operations by bringing important workflows into a single application.

The application follows a frontend-backend architecture:

- **Frontend:** Provides the user interface and hospital management screens.
- **Backend:** Handles API requests, application logic, authentication, and data operations.
- **Database:** Stores application data using SQLite by default.
- **AI integration:** Connects the AI assistant to Google's Gemini API through the backend.

The project is intended for learning, development, demonstration, and further improvement. It is not a substitute for a clinically validated healthcare information system.

---

## ✨ Features

### 1. Patient Management
- Patient registration and record management.
- Patient listing and patient details interface.
- Patient-related data operations through the backend.

### 2. Appointment Management
- Appointment management interface.
- Centralized access to appointment-related information.
- Backend API integration for supported operations.

### 3. Doctor and Department Management
- Doctor management screens.
- Department management screens.
- Organization of hospital-related information.

### 4. OPD and IPD
- Outpatient department (OPD) workflows.
- Inpatient department (IPD) interface.
- Dedicated frontend modules and backend routes.

### 5. Laboratory Management
- Laboratory orders.
- Laboratory reports interface.
- Backend routes for laboratory-related workflows and report documents.

### 6. Pharmacy and Prescriptions
- Pharmacy management interface.
- Prescription-related screens.
- Supporting backend modules for pharmacy operations.

### 7. Billing
- Billing management interface.
- Backend billing routes.
- Support for further development of billing workflows.

### 8. AI Assistant
- AI assistant interface.
- Gemini API integration through the backend.
- Backend AI assistant and AI tools modules.

AI-generated output must be reviewed by an appropriately qualified healthcare professional before being used in a clinical context.

### 9. Authentication and Permissions
- Authentication-related backend routes.
- Security and permission modules.
- Frontend authentication and permission handling.

**Note:** The presence of a feature or module does not guarantee that every workflow is fully implemented or production-ready. Verify functionality and authorization rules before deployment.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Python, FastAPI |
| API Server | Uvicorn |
| Database | SQLite by default |
| AI Integration | Google Gemini API |
| API Documentation | OpenAPI, Swagger UI, ReDoc |
| Version Control | Git and GitHub |

The backend also contains a legacy Django code directory under `_legacy_unused/`. The primary backend startup instructions in this README use FastAPI.

---

## 📁 Project Structure

```text
careflow_AI/
│
├── README.md
├── .gitignore
│
├── careflow-backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── fix_patient_data.py
│   │
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── security.py
│   │   ├── permissions.py
│   │   ├── crud_factory.py
│   │   ├── migrations.py
│   │   ├── gemini_assistant.py
│   │   ├── ai_tools.py
│   │   │
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── users.py
│   │       ├── dashboard.py
│   │       ├── billing.py
│   │       ├── opd.py
│   │       ├── ipd.py
│   │       ├── lab_orders.py
│   │       ├── lab_report_documents.py
│   │       ├── pharmacy.py
│   │       ├── permissions.py
│   │       └── ai_assistant.py
│   │
│   └── _legacy_unused/
│
└── careflow-frontend/
    ├── index.html
    ├── login.html
    ├── api.js
    ├── app.js
    ├── auth.js
    ├── storage.js
    ├── server-config.js
    ├── style.css
    ├── responsive.css
    │
    ├── patients.html
    ├── patient-details.html
    ├── appointments.html
    ├── doctors.html
    ├── departments.html
    ├── opd.html
    ├── ipd.html
    ├── lab-orders.html
    ├── lab-reports.html
    ├── prescriptions.html
    ├── pharmacy.html
    ├── billing.html
    ├── ai-assistant.html
    └── settings.html
```

The structure above highlights the main application files. Additional CSS and JavaScript files support individual screens and components.

---

## 💻 System Requirements

Before installing CareFlow AI, make sure you have:

- Windows, macOS, or Linux.
- Python 3.10 or newer, compatible with the project's dependencies.
- Git.
- Visual Studio Code or another code editor.
- A modern web browser.
- A Google Gemini API key if you want to use the AI integration.
- VS Code Live Server or another local static web server for the frontend.

Python version and dependency compatibility should be confirmed against the current `requirements.txt`.

---

## 🚀 Installation and Setup

### Step 1: Clone the repository

```bash
git clone https://github.com/puneet-a11/careflow_AI.git
cd careflow_AI
```

If you already have the project downloaded, open the project root directory in your terminal instead.

### Step 2: Open the backend directory

```bash
cd careflow-backend
```

### Step 3: Create a Python virtual environment

**Windows PowerShell:**

```powershell
py -m venv venv
.\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, you can use Command Prompt instead:

```bat
venv\Scripts\activate.bat
```

### Step 4: Install dependencies

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Wait until the installation finishes successfully.

### Step 5: Configure environment variables

Copy the example configuration:

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux:**

```bash
cp .env.example .env
```

Open `careflow-backend/.env` in your editor and configure the required values. See the [Environment Configuration](#-environment-configuration) section.

### Step 6: Start the backend

Run this command from inside `careflow-backend/`:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If startup succeeds, the backend will be available at:

- API base: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- OpenAPI schema: `http://127.0.0.1:8000/openapi.json`

These documentation URLs are available when the corresponding FastAPI documentation routes are enabled.

Keep the backend terminal running while using the frontend.

---

## 🔐 Environment Configuration

The backend uses environment variables to configure authentication, database access, AI integration, CORS, and debug behavior.

Example configuration:

```dotenv
SECRET_KEY=replace-with-a-long-random-secret
ACCESS_TOKEN_EXPIRE_MINUTES=1440

DATABASE_URL=sqlite:///./careflow.db

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite

CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:5501,https://localhost,capacitor://localhost

DEBUG=true
```

Use the project's `.env.example` as the source of truth for supported variables and their expected format.

### Environment variable reference

| Variable | Purpose |
|---|---|
| `SECRET_KEY` | Secret used for signing or validating authentication tokens, according to backend configuration. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Configures the access-token expiration period. |
| `DATABASE_URL` | Selects the database connection. SQLite is the default example. |
| `GEMINI_API_KEY` | API credential used by the Gemini integration. |
| `GEMINI_MODEL` | Gemini model identifier used by the application. |
| `CORS_ORIGINS` | Comma-separated list of allowed frontend origins. |
| `DEBUG` | Controls debug-related behavior as implemented by the backend. |

### Important configuration rules

- Never commit your real `.env` file.
- Never put the Gemini API key in frontend JavaScript.
- Replace the example `SECRET_KEY` with a strong, randomly generated secret.
- Set `DEBUG=false` in production and verify the application's production configuration.
- Configure CORS to allow only the actual frontend origins you trust.
- Do not use the example secret in a deployed environment.

---

## 🌐 Running the Application

CareFlow AI has separate frontend and backend directories. Run them in separate terminals.

### Terminal 1: Backend

```powershell
cd path\to\careflow_AI\careflow-backend
.\venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Replace `path\to\careflow_AI` with the actual project path on your computer.

### Terminal 2: Frontend

Open the `careflow-frontend` directory in Visual Studio Code.

1. Install the Live Server extension if it is not already installed.
2. Open `login.html` or the appropriate entry page.
3. Select **Open with Live Server**.
4. Check the URL shown in your browser.

The example configuration allows common development origins on ports `5500`, `5501`, and `3000`. Make sure the actual frontend origin is present in `CORS_ORIGINS`.

If the frontend uses a different entry page, open the page appropriate to the current application flow.

---

## 🔌 API Documentation

CareFlow AI uses FastAPI for its backend API.

### Interactive API documentation

Start the backend and visit:

```text
http://127.0.0.1:8000/docs
```

Swagger UI allows developers to inspect registered endpoints, review request parameters and response schemas, and try supported requests.

Alternative documentation:

```text
http://127.0.0.1:8000/redoc
```

Machine-readable OpenAPI specification:

```text
http://127.0.0.1:8000/openapi.json
```

### Backend API modules

The backend contains route modules for the following areas:

| Module | Responsibility |
|---|---|
| `auth.py` | Authentication-related endpoints |
| `users.py` | User-related operations |
| `dashboard.py` | Dashboard and analytics operations |
| `billing.py` | Billing operations |
| `opd.py` | Outpatient department workflows |
| `ipd.py` | Inpatient department workflows |
| `lab_orders.py` | Laboratory order workflows |
| `lab_report_documents.py` | Laboratory report document workflows |
| `pharmacy.py` | Pharmacy operations |
| `permissions.py` | Permission-related operations |
| `ai_assistant.py` | AI assistant operations |

The exact HTTP methods, endpoint paths, request bodies, response formats, and authentication requirements are defined by the running backend's OpenAPI specification. Consult `/docs` rather than assuming that a module name is an endpoint URL.

### Testing an API endpoint

1. Start the backend.
2. Open Swagger UI at `/docs`.
3. Locate the endpoint you want to test.
4. Review the request schema and required fields.
5. Authenticate if the endpoint requires authorization.
6. Use **Try it out** and enter valid test data.
7. Execute the request and inspect the response and status code.

### API integration flow

```text
Frontend page
     |
     v
JavaScript API client (api.js)
     |
     v
FastAPI backend
     |
     v
Router and application logic
     |
     v
Database or configured AI provider
     |
     v
JSON response to frontend
```

This is the intended integration pattern. Confirm individual screens and endpoints are connected and working before treating a workflow as complete.

---

## 🗄️ Database

SQLite is the default database configuration in the supplied environment example.

Example:

```dotenv
DATABASE_URL=sqlite:///./careflow.db
```

The database layer and models are located in:

```text
careflow-backend/app/database.py
careflow-backend/app/models.py
careflow-backend/app/schemas.py
careflow-backend/app/migrations.py
```

The backend may create or initialize database structures according to its implementation.

### Database considerations

- The actual database file is generated or maintained locally and should not be committed to Git.
- Back up the database before performing migrations or data corrections.
- Use synthetic data during development and demonstrations.
- Do not put real patient records in a public repository.
- Verify the configured database URL and initialization behavior before deploying.
- Review migration and backup procedures before upgrading a production database.

### Optional database migration

The backend environment example also documents a possible MySQL configuration. Before switching to MySQL, verify the required database driver, connection settings, schema compatibility, and migration process. Do not assume SQLite and MySQL are interchangeable without testing.

---

## 🤖 AI Assistant Setup

CareFlow AI includes a Gemini-backed assistant integration.

Relevant backend files:

```text
careflow-backend/app/gemini_assistant.py
careflow-backend/app/ai_tools.py
careflow-backend/app/routers/ai_assistant.py
```

### Step 1: Obtain a Gemini API key

Create or obtain an API key through Google AI Studio:

https://aistudio.google.com/

Check Google's current API availability, model access, quotas, and terms for your account.

### Step 2: Add the API key to the backend environment

Edit `careflow-backend/.env`:

```dotenv
GEMINI_API_KEY=your_actual_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Use the model identifier supported by your current backend implementation and Google account. The value shown here comes from the project's example configuration.

### Step 3: Restart the backend

Stop the running backend with `Ctrl+C`, then start it again:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Step 4: Test the integration

- Confirm the backend starts successfully.
- Inspect the AI assistant endpoints in Swagger UI.
- Check that the API key is configured on the backend.
- Test the assistant with non-sensitive sample input.
- Inspect server logs if the provider returns an error.

### AI safety and limitations

- AI responses may be inaccurate, incomplete, or outdated.
- Do not use the assistant as the sole basis for diagnosis, prescriptions, or treatment decisions.
- Do not submit identifiable patient information to an external AI provider unless the system, applicable law, and provider arrangements explicitly permit it.
- Apply authentication, authorization, logging, and data-minimization controls to AI endpoints.
- Never expose the API key to browsers, mobile clients, or public repositories.

---

## 🔗 Frontend and Backend Integration

The frontend contains API and configuration files, including:

```text
careflow-frontend/api.js
careflow-frontend/server-config.js
careflow-frontend/auth.js
careflow-frontend/storage.js
```

These files are important when troubleshooting API connectivity.

### Integration checklist

- The backend is running on the expected address and port.
- The frontend points to the correct backend API base URL.
- The frontend's origin is allowed by backend CORS configuration.
- Authentication headers or tokens are included where required.
- Request payloads match the backend schemas.
- Errors and expired sessions are handled appropriately.
- The application does not store sensitive credentials in frontend source code.

When deploying the application, update the frontend API configuration to use the deployed backend's HTTPS URL. Do not assume that `127.0.0.1` on a deployed frontend refers to the backend server.

---

## 🔒 Security Considerations

CareFlow AI handles workflows related to healthcare information. Security must be treated as a core requirement.

Before deployment:

- Use strong secrets and secure environment-variable management.
- Enforce authentication and server-side authorization for protected endpoints.
- Verify role and permission checks on every sensitive operation.
- Validate and sanitize incoming data.
- Use HTTPS in production.
- Restrict CORS to trusted origins.
- Apply appropriate rate limits to authentication and AI endpoints.
- Avoid exposing stack traces, credentials, internal paths, or sensitive data in production errors.
- Configure secure token expiration and invalidation behavior.
- Protect database backups and uploaded documents.
- Use audit logging for sensitive data access and changes.
- Avoid committing `.env`, database files, patient data, or credentials.
- Use synthetic patient data in public demonstrations.
- Review applicable privacy, security, and healthcare regulations before real-world use.

A successful local run does not mean the application is security-audited or production-ready.

---

## 🧰 Troubleshooting

### 1. `uvicorn` is not recognized

Activate the virtual environment and install the dependencies:

```powershell
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Then run Uvicorn as a Python module:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. `ModuleNotFoundError`

Make sure you are inside `careflow-backend/`, activate the correct virtual environment, and install `requirements.txt`.

### 3. The backend fails during startup

- Read the complete terminal traceback.
- Check the environment variables in `.env`.
- Confirm the database URL is valid.
- Confirm the installed dependencies match the project.
- Verify that port `8000` is available.

### 4. Frontend cannot connect to the backend

- Confirm the backend is running.
- Review `api.js` and `server-config.js`.
- Confirm the API base URL.
- Check browser developer tools for network and CORS errors.
- Add the correct frontend origin to `CORS_ORIGINS` if necessary.
- Restart the backend after configuration changes.

### 5. Gemini API errors

- Confirm `GEMINI_API_KEY` is set in the backend environment.
- Check the selected model identifier.
- Verify API access, quotas, billing requirements if applicable, and provider availability.
- Review backend logs without printing the secret.
- Restart the backend after changing environment variables.

### 6. API returns `401` or `403`

Check whether the endpoint requires authentication, whether the supplied token is valid and unexpired, and whether the current user has the necessary server-side permissions.

### 7. Database errors

Check the database URL, file permissions, database initialization, and migration behavior. Back up existing data before making changes.

### 8. Git ignores the README

If the repository's `.gitignore` contains `*.md`, Git will ignore Markdown files, including `README.md`.

To stage the root README explicitly:

```powershell
git add -f README.md
```

For future changes, consider adjusting `.gitignore` to ignore the other Markdown reports while allowing `README.md`.

---

## 🛣️ Future Improvements

Potential improvements include:

- Comprehensive automated tests.
- Stronger role-based access control and authorization tests.
- Improved audit logging and security monitoring.
- Better input validation and error handling.
- More complete billing and prescription workflows.
- Reliable notification workflows.
- Database migration and backup automation.
- Responsive design and accessibility improvements.
- Production deployment with HTTPS and managed secrets.
- CI/CD pipelines and automated quality checks.
- Integration tests for the AI assistant and frontend/backend workflows.

These items are a roadmap, not a claim that the features are already implemented.

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome.

Suggested workflow:

1. Fork the repository.
2. Create a feature branch.
3. Make focused changes.
4. Test the affected functionality.
5. Review your changes for secrets and sensitive data.
6. Submit a pull request describing the change.

Please do not submit API keys, passwords, real patient information, or production database files.

---

## 📄 License

No license has been specified in this README. Unless a license file or other applicable license is present in the repository, do not assume that the project is open-source or that unrestricted reuse is permitted.

A suitable license can be added after the project owner decides how the code may be used and distributed.

---

## 👨‍💻 Project

**CareFlow AI — AI-Powered Hospital Management System**

GitHub repository:

https://github.com/puneet-a11/careflow_AI

For setup questions or bug reports, open an issue in the repository with the relevant error message and steps to reproduce it. Remove secrets and personal information before sharing logs.
