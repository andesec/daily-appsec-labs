-- Seed data for OAuth 2.0 + PKCE Multi-Tenant SaaS Lab

-- Insert tenants
INSERT INTO tenants (id, name, domain) VALUES
    (1, 'Acme Corporation', 'acme.example.com'),
    (2, 'Beta Industries', 'beta.example.com')
ON CONFLICT (name) DO NOTHING;

-- Insert users (these correspond to Keycloak users)
INSERT INTO users (id, email, tenant_id, full_name, is_active) VALUES
    (1, 'alice@acme.example.com', 1, 'Alice Anderson', true),
    (2, 'bob@acme.example.com', 1, 'Bob Builder', true),
    (3, 'charlie@beta.example.com', 2, 'Charlie Chen', true)
ON CONFLICT (email) DO NOTHING;

-- Insert resources for Tenant 1 (Acme Corporation)
INSERT INTO resources (tenant_id, owner_id, name, description, data, is_public) VALUES
    (1, 1, 'Acme Q1 Financial Report', 'Confidential financial data for Q1 2024',
     '{"revenue": 1500000, "expenses": 800000, "profit": 700000, "confidential": true}', false),

    (1, 1, 'Customer Database', 'Internal customer records for Acme',
     '{"total_customers": 1250, "active": 980, "classification": "restricted"}', false),

    (1, 2, 'Product Roadmap 2024', 'Strategic product development plan',
     '{"products": ["Widget Pro", "Gadget Plus"], "launch_dates": ["Q2", "Q4"]}', false),

    (1, 2, 'Marketing Campaign Assets', 'Public marketing materials',
     '{"campaign": "Summer Sale 2024", "budget": 50000}', true),

    (1, 1, 'API Keys and Secrets', 'Production API credentials (SENSITIVE)',
     '{"aws_key": "AKIA...", "db_password": "super_secret_123", "stripe_key": "sk_live_..."}', false)
ON CONFLICT DO NOTHING;

-- Insert resources for Tenant 2 (Beta Industries)
INSERT INTO resources (tenant_id, owner_id, name, description, data, is_public) VALUES
    (2, 3, 'Beta Trade Secrets', 'Proprietary manufacturing process',
     '{"process": "classified", "patent_pending": true, "value": "high"}', false),

    (2, 3, 'Employee Salary Data', 'Confidential compensation information',
     '{"total_employees": 85, "avg_salary": 75000, "classifications": ["Executive", "Manager", "Staff"]}', false),

    (2, 3, 'Beta Public Press Kit', 'Public relations materials',
     '{"founded": 2015, "industry": "Manufacturing", "website": "beta.example.com"}', true),

    (2, 3, 'M&A Discussion Documents', 'Confidential merger and acquisition plans',
     '{"target_company": "Gamma Corp", "offer_amount": 5000000, "due_diligence": "in_progress"}', false),

    (2, 3, 'Beta Security Audit Report', 'Internal security assessment results',
     '{"vulnerabilities_found": 12, "critical": 3, "high": 5, "medium": 4, "status": "remediation_in_progress"}', false)
ON CONFLICT DO NOTHING;

-- Reset sequences to continue from current max values
SELECT setval('tenants_id_seq', (SELECT MAX(id) FROM tenants));
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('resources_id_seq', (SELECT MAX(id) FROM resources));
