# IASW - Name Change System

## Overview
Intelligent Account Servicing Workflow (IASW) for Legal Name Change with Human-in-the-Loop (HITL).

## Features
- AI-based document verification
- Confidence scoring & explanation
- FileNet mock archival
- Checker approval system
- HITL enforced (AI cannot update system directly)

## Tech Stack
- React (Vite)
- Node.js (Express)
- PostgreSQL
- Tesseract.js
- OpenAI (optional)

## How to Run

### Backend
cd backend
npm install
npm start

### Frontend
cd frontend
npm install
npm run dev

## Workflow
1. Staff submits request
2. AI processes document
3. Stored in pending table
4. Checker approves/rejects
5. RPS updated only after approval