# Security Guidelines

## Environment Variables

### Setup

1. Copy `.env.example` to `.env`
2. Fill in your actual values
3. **NEVER commit `.env` files to git**

### Production Security

- Use strong, unique credentials
- Rotate keys regularly (every 90 days)
- Use environment-specific configurations
- Monitor access logs regularly

### Development Security

- Use test accounts with minimal funds
- Never use production keys in development
- Use separate Supabase projects for dev/staging/prod

## Reporting Security Issues

If you discover a security vulnerability, please email: security@giveprotocol.io

**Do not** create public GitHub issues for security vulnerabilities.

## Credential Rotation Schedule

- **Immediate**: If compromise suspected
- **Quarterly**: All API keys and secrets
- **After team changes**: Any shared credentials

## Security Checklist

- [ ] All `.env` files are in `.gitignore`
- [ ] No hardcoded secrets in source code
- [ ] All production credentials are unique and strong
- [ ] Regular security audits completed
- [ ] Team trained on security best practices
