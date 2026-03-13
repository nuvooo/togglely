describe('API Keys', () => {
  beforeEach(() => {
    cy.login('demo@flagify.io', 'demo1234')
    cy.visit('/api-keys')
  })

  it('should display API keys list', () => {
    cy.contains('API Keys').should('be.visible')
    cy.contains('Demo SDK Key').should('be.visible')
  })

  it('should create server API key', () => {
    cy.get('button').contains(/new api key|create key/i).click()
    cy.get('select[name="organizationId"], select[id="key-org"]').select('Demo Organization')
    cy.get('input[name="name"], input[id="key-name"]').type(`Server Key ${Date.now()}`)
    cy.get('select[name="type"], select[id="key-type"]').select('SERVER')
    cy.get('button[type="submit"]').contains(/create/i).click()
    
    // Should show the generated key
    cy.contains(/api key created|success/i).should('be.visible')
    cy.get('code, [data-testid="api-key"]').should('be.visible')
  })

  it('should create SDK API key', () => {
    cy.get('button').contains(/new api key/i).click()
    cy.get('select[name="organizationId"]').select('Demo Organization')
    cy.get('input[name="name"]').type(`SDK Key ${Date.now()}`)
    cy.get('select[name="type"]').select('SDK')
    cy.get('button[type="submit"]').contains(/create/i).click()
    cy.contains(/api key created|success/i).should('be.visible')
  })

  it('should create client API key', () => {
    cy.get('button').contains(/new api key/i).click()
    cy.get('select[name="organizationId"]').select('Demo Organization')
    cy.get('input[name="name"]').type(`Client Key ${Date.now()}`)
    cy.get('select[name="type"]').select('CLIENT')
    cy.get('button[type="submit"]').contains(/create/i).click()
    cy.contains(/api key created|success/i).should('be.visible')
  })

  it('should copy API key to clipboard', () => {
    cy.contains('Demo SDK Key').parents('tr, [class*="card"]').first()
      .find('button').contains(/copy|clipboard/i).click()
    cy.contains(/copied/i).should('be.visible')
  })

  it('should revoke API key', () => {
    // Create a key to revoke
    cy.get('button').contains(/new api key/i).click()
    cy.get('select[name="organizationId"]').select('Demo Organization')
    const keyName = `Revoke Key ${Date.now()}`
    cy.get('input[name="name"]').type(keyName)
    cy.get('button[type="submit"]').contains(/create/i).click()
    
    // Close the success modal if exists
    cy.get('body').click({ force: true })
    
    // Revoke it
    cy.contains(keyName).parents('tr, [class*="card"]').first()
      .find('button').contains(/revoke|delete/i).click({ force: true })
    cy.get('button').contains(/confirm|yes/i).click()
    cy.contains(keyName).should('not.exist')
  })

  it('should filter by organization', () => {
    cy.get('select[name="organization"]').select('Demo Organization')
    cy.contains('Demo SDK Key').should('be.visible')
  })
})
