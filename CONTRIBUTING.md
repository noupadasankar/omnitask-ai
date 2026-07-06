# Contributing to OmniTask AI

We welcome contributions from the community! This document describes how to contribute to OmniTask AI.

## How to Contribute

1. **Fork the repository** on GitHub.
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** following the code style guidelines below.
4. **Write tests** for all new functionality (minimum 80% coverage on new code).
5. **Run the test suite**: `pnpm test` — all tests must pass.
6. **Run linting**: `pnpm lint` — zero warnings allowed.
7. **Commit** using conventional commits format (see below).
8. **Push** to your fork.
9. **Open a Pull Request** with a clear description of the change and any related issues.

## Code Style Guidelines

- **TypeScript**: Strict mode enabled. No `as any` casts. No `@ts-ignore`.
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces, UPPER_SNAKE_CASE for constants.
- **Functions**: Maximum 50 lines. Single responsibility. Named parameters for > 3 args.
- **Files**: Maximum 300 lines. Split into smaller modules if larger.
- **Tests**: Every new service method needs a corresponding unit test.
- **Security**: Never log sensitive data. Always validate input. Always check ownership.

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add voice input to job agent
fix: resolve IDOR vulnerability in memory controller
docs: update deployment guide for Kubernetes
test: add unit tests for vault service
refactor: split execution engine into smaller services
chore: update dependencies
security: rotate exposed credentials
```

## Pull Request Requirements

- [ ] All existing tests pass
- [ ] New tests written for new functionality
- [ ] TypeScript compiles with zero errors
- [ ] ESLint passes with zero warnings
- [ ] No new secrets or credentials in code
- [ ] PR description explains the change and links any related issues

## Development Setup

See [Getting Started](MAIN-README.md#getting-started) in the main README for full setup instructions.

```bash
# Install dependencies
pnpm install

# Start development environment
pnpm dev

# Run tests in watch mode
pnpm --filter backend test:watch

# Check TypeScript compilation
pnpm type-check

# Run linter
pnpm lint

# Auto-fix lint issues
pnpm lint:fix

# Format code
pnpm format
```

## Reporting Security Vulnerabilities

**Do not open a public GitHub issue for security vulnerabilities.**

Email `security@omnitask.ai` with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Your contact information

We will acknowledge within 24 hours and provide a fix timeline within 72 hours.

## Code of Conduct

Please be respectful and constructive in all interactions. We are committed to providing a welcoming environment for all contributors.
