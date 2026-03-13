describe('Dashboard', () => {
  beforeEach(() => {
    cy.login('demo@flagify.io', 'demo1234')
    cy.visit('/')
  })

  it('should display dashboard', () => {
    cy.contains('Dashboard').should('be.visible')
    cy.contains('Overview of your feature flag management').should('be.visible')
  })

  it('should display stats cards', () => {
    cy.contains('Organizations').should('be.visible')
    cy.contains('Projects').should('be.visible')
    cy.contains('Feature Flags').should('be.visible')
    cy.contains('API Keys').should('be.visible')
  })

  it('should navigate to organizations from stats', () => {
    cy.contains('Organizations').click()
    cy.url().should('include', '/organizations')
  })

  it('should navigate to projects from stats', () => {
    cy.contains('Projects').click()
    cy.url().should('include', '/projects')
  })

  it('should navigate to feature flags from stats', () => {
    cy.contains('Feature Flags').click()
    cy.url().should('include', '/feature-flags')
  })

  it('should display recent activity', () => {
    cy.contains('Recent Activity').should('be.visible')
  })

  it('should display quick actions', () => {
    cy.contains('Quick Actions').should('be.visible')
    cy.contains('Create Organization').should('be.visible')
    cy.contains('Create Project').should('be.visible')
    cy.contains('Create Feature Flag').should('be.visible')
  })

  it('should navigate via quick actions', () => {
    cy.contains('Create Organization').click()
    cy.url().should('include', '/organizations')
  })

  it('should display getting started section', () => {
    cy.contains('Getting Started with Flagify').should('be.visible')
  })
})
