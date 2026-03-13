describe('Organizations', () => {
  beforeEach(() => {
    cy.login('demo@flagify.io', 'demo1234')
    cy.visit('/organizations')
  })

  it('should display organizations list', () => {
    cy.contains('Organizations').should('be.visible')
    cy.contains('Demo Organization').should('be.visible')
  })

  it('should create new organization', () => {
    const orgName = `Test Org ${Date.now()}`
    cy.get('button').contains(/new organization|create organization/i).click()
    cy.get('input[name="name"], input[id="org-name"], input[placeholder*="name" i]').first().type(orgName)
    cy.get('button[type="submit"]').contains(/create|save/i).click()
    cy.contains(orgName).should('be.visible')
  })

  it('should search organizations', () => {
    cy.get('input[placeholder*="search" i], input[type="search"]').type('Demo')
    cy.contains('Demo Organization').should('be.visible')
  })

  it('should navigate to organization detail', () => {
    cy.contains('Demo Organization').click()
    cy.url().should('include', '/organizations/')
    cy.contains('Organization Overview').should('be.visible')
  })

  it('should display organization members', () => {
    cy.contains('Demo Organization').click()
    cy.contains('Members').click()
    cy.contains('Demo User').should('be.visible')
  })

  it('should display organization projects', () => {
    cy.contains('Demo Organization').click()
    cy.contains('Projects').click()
    cy.contains('Demo Project').should('be.visible')
  })

  it('should invite member to organization', () => {
    cy.contains('Demo Organization').click()
    cy.contains('Members').click()
    cy.get('button').contains(/invite|add member/i).click()
    cy.get('input[type="email"]').type('newmember@example.com')
    cy.get('button').contains(/send invite|invite/i).click()
    cy.contains('newmember@example.com').should('be.visible')
  })

  it('should delete organization', () => {
    // First create an org to delete
    const orgName = `Delete Test ${Date.now()}`
    cy.get('button').contains(/new organization/i).click()
    cy.get('input[name="name"], input[id="org-name"]').first().type(orgName)
    cy.get('button[type="submit"]').contains(/create/i).click()
    cy.contains(orgName).should('be.visible')
    
    // Now delete it
    cy.contains(orgName).parents('[data-testid="organization-card"], .organization-card, tr, [class*="card"]').first()
      .find('button').contains(/delete|remove/i).click({ force: true })
    cy.get('button').contains(/confirm|yes|delete/i).click()
    cy.contains(orgName).should('not.exist')
  })
})
