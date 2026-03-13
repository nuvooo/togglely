describe('Authentication', () => {
  beforeEach(() => {
    cy.visit('/login')
  })

  it('should display login form', () => {
    cy.get('input[type="email"]').should('be.visible')
    cy.get('input[type="password"]').should('be.visible')
    cy.get('button[type="submit"]').should('contain', /sign in|login/i)
  })

  it('should login with demo credentials', () => {
    cy.get('input[type="email"]').type('demo@flagify.io')
    cy.get('input[type="password"]').type('demo1234')
    cy.get('button[type="submit"]').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    cy.contains('Dashboard').should('be.visible')
  })

  it('should show error for invalid credentials', () => {
    cy.get('input[type="email"]').type('invalid@example.com')
    cy.get('input[type="password"]').type('wrongpassword')
    cy.get('button[type="submit"]').click()
    cy.contains(/invalid|error|failed/i).should('be.visible')
  })

  it('should logout successfully', () => {
    // Login first
    cy.get('input[type="email"]').type('demo@flagify.io')
    cy.get('input[type="password"]').type('demo1234')
    cy.get('button[type="submit"]').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    
    // Logout
    cy.get('button').contains(/logout|sign out/i).click()
    cy.url().should('include', '/login')
  })

  it('should redirect to login when accessing protected route', () => {
    cy.visit('/organizations')
    cy.url().should('include', '/login')
  })
})

describe('Registration', () => {
  beforeEach(() => {
    cy.visit('/register')
  })

  it('should display registration form', () => {
    cy.get('input[type="email"]').should('be.visible')
    cy.get('input[type="password"]').should('be.visible')
    cy.get('input[name="firstName"], input[placeholder*="first" i]').should('be.visible')
    cy.get('input[name="lastName"], input[placeholder*="last" i]').should('be.visible')
    cy.get('input[name="organizationName"], input[placeholder*="organization" i]').should('be.visible')
  })

  it('should register new user', () => {
    const timestamp = Date.now()
    cy.get('input[name="firstName"], input[placeholder*="first" i]').type('Test')
    cy.get('input[name="lastName"], input[placeholder*="last" i]').type('User')
    cy.get('input[type="email"]').type(`test${timestamp}@example.com`)
    cy.get('input[type="password"]').type('TestPassword123!')
    cy.get('input[name="organizationName"], input[placeholder*="organization" i]').type(`Test Org ${timestamp}`)
    cy.get('button[type="submit"]').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
    cy.contains('Dashboard').should('be.visible')
  })
})
