-- ============================================================
-- NAME CHANGE WORKFLOW — DATABASE SCHEMA
-- Run this file once to set up all tables in PostgreSQL
-- ============================================================

-- 1. CUSTOMERS TABLE (mock core system / RPS)
--    Represents existing customer records
CREATE TABLE IF NOT EXISTS customers (
    customer_id     VARCHAR(20) PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(100),
    phone           VARCHAR(20),
    date_of_birth   DATE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. NAME_CHANGE_REQUESTS TABLE
--    Stores every request submitted by staff
CREATE TABLE IF NOT EXISTS name_change_requests (
    request_id              SERIAL PRIMARY KEY,

    -- Change type (future-proofing for Address/DOB/Contact)
    change_type             VARCHAR(30) NOT NULL DEFAULT 'LEGAL_NAME',

    -- Staff-submitted fields
    customer_id             VARCHAR(20) NOT NULL REFERENCES customers(customer_id),
    requested_old_name      VARCHAR(100) NOT NULL,
    requested_new_name      VARCHAR(100) NOT NULL,

    -- Uploaded document reference (file stored on disk/S3)
    document_path           VARCHAR(300),
    document_original_name  VARCHAR(200),

    -- AI / OCR extracted fields
    extracted_old_name      VARCHAR(100),   -- e.g. Bride name from certificate
    extracted_new_name      VARCHAR(100),   -- e.g. Married name from certificate

    -- AI confidence scores (0.00 to 100.00)
    score_old_name          NUMERIC(5,2),   -- How well old name matched OCR
    score_new_name          NUMERIC(5,2),   -- How well new name matched OCR
    score_authenticity      NUMERIC(5,2),   -- Document forgery/authenticity score

    -- Explainability + decisioning
    overall_confidence      NUMERIC(5,2),   -- overall score across checks
    explanation             TEXT,           -- JSON array of strings
    recommended_action      VARCHAR(10),    -- APPROVE | REVIEW | REJECT
    forgery_status          VARCHAR(10),    -- PASS | FLAG | FAIL (prototype)

    -- “Document store” reference (mock FileNet stand-in)
    filenet_ref_id          VARCHAR(80),

    -- AI-generated summary for human checker
    ai_summary              TEXT,

    -- Workflow status
    -- INITIATED                     → staff submitted, request record created
    -- PROCESSING                    → AI pipeline running (digital maker)
    -- AI_VERIFIED_PENDING_HUMAN     → AI done; awaiting human checker (maker-checker)
    -- APPROVED                      → human approved; RPS update executed
    -- REJECTED                      → human rejected
    -- ERROR                         → validation OK but AI pipeline failed
    status                  VARCHAR(30) NOT NULL DEFAULT 'INITIATED',

    -- Performance metrics (basic)
    processing_time_ms      INT,

    -- Human checker decision
    checker_name            VARCHAR(100),
    checker_comment         TEXT,
    review_notes            TEXT,
    rejection_reason        VARCHAR(30),    -- NAME_MISMATCH | LOW_CONFIDENCE | FORGERY_FLAG
    checked_at              TIMESTAMP,

    -- Timestamps
    submitted_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. AUDIT_LOG TABLE
--    Every action (AI or human) is logged here for compliance
CREATE TABLE IF NOT EXISTS audit_log (
    log_id          SERIAL PRIMARY KEY,
    request_id      INT REFERENCES name_change_requests(request_id),
    action          VARCHAR(100) NOT NULL,   -- e.g. 'OCR_COMPLETE', 'HUMAN_APPROVED'
    performed_by    VARCHAR(100),            -- 'AI_AGENT' or checker's name
    details         TEXT,                    -- JSON string with extra info
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- SEED DATA — Sample customers for testing
-- ============================================================
INSERT INTO customers (customer_id, full_name, email, phone, date_of_birth)
VALUES
    ('CUST001', 'Priya Sharma',   'priya.sharma@email.com',   '9876543210', '1995-04-12'),
    ('CUST002', 'Anjali Verma',   'anjali.verma@email.com',   '9123456789', '1992-08-22'),
    ('CUST003', 'Sneha Gupta',    'sneha.gupta@email.com',    '9988776655', '1998-01-30'),
    ('CUST004', 'Ritu Agarwal',   'ritu.agarwal@email.com',   '9871234567', '1990-11-05'),
    ('CUST005', 'Meena Joshi',    'meena.joshi@email.com',    '9765432108', '1996-07-19')
ON CONFLICT (customer_id) DO NOTHING;

-- ============================================================
-- INDEXES for faster lookups
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_requests_customer_id ON name_change_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_status      ON name_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_audit_request_id     ON audit_log(request_id);

-- ============================================================
-- BACKWARDS-COMPATIBLE MIGRATIONS (for existing DBs)
-- ============================================================
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS change_type VARCHAR(30) NOT NULL DEFAULT 'LEGAL_NAME';
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS overall_confidence NUMERIC(5,2);
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS recommended_action VARCHAR(10);
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS forgery_status VARCHAR(10);
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS filenet_ref_id VARCHAR(80);
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS processing_time_ms INT;
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE name_change_requests ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(30);
