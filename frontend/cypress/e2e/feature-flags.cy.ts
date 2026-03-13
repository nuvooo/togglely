describe('Feature Flags', () => {
  beforeEach(() => {
    cy.login('demo@flagify.io', 'demo1234')
  })

  it('should display feature flags list', () => {
    cy.visit('/feature-flags')
    cy.contains('Feature Flags').should('be.visible')
    cy.contains('New Dashboard').should('be.visible')
    cy.contains('Dark Mode').should('be.visible')
  })

  it('should create boolean feature flag', () => {
    cy.visit('/projects')
    cy.contains('Demo Project').click()
    
    const flagName = `Test Flag ${Date.now()}`
    cy.get('button').contains(/new feature flag/i).click()
    cy.get('input[name="name"], input[id="flag-name"]').first().type(flagName)
    cy.get('input[name="key"], input[id="flag-key"]').first().type(flagName.toLowerCase().replace(/\s+/g, '-'))
    cy.get('select[name="type"], select[id="flag-type"]').select('BOOLEAN')
    cy.get('button[type="submit"]').contains(/create/i).click()
    cy.contains(flagName).should('be.visible')
  })

  it('should create string feature flag', () => {
    cy.visit('/projects')
    cy.contains('Demo Project').click()
    
    const flagName = `String Flag ${Date.now()}`
    cy.get('button').contains(/new feature flag/i).click()
    cy.get('input[name="name"]').first().type(flagName)
    cy.get('input[name="key"]').first().type(`string-${Date.now()}`)
    cy.get('select[name="type"]').select('STRING')
    cy.get('input[name="defaultValue"], input[id="flag-default"]').type('default-value')
    cy.get('button[type="submit"]').contains(/create/i).click()
    cy.contains(flagName).should('be.visible')
  })

  it('should toggle feature flag in environment', () => {
    cy.visit('/feature-flags')
    cy.contains('New Dashboard').parents('tr, [class*="card"]').first()
      .find('input[type="checkbox"], button[role="switch"]').first().click()
    cy.contains('Flag toggled').should('be.visible')
  })

  it('should search feature flags', () => {
    cy.visit('/feature-flags')
    cy.get('input[placeholder*="search" i]').type('Dark')
    cy.contains('Dark Mode').should('be.visible')
    cy.contains('New Dashboard').should('not.exist')
  })

  it('should filter by project', () => {
    cy.visit('/feature-flags')
    cy.get('select[name="project"], select[id="project-filter"]').select('Demo Project')
    cy.contains('New Dashboard').should('be.visible')
  })

  it('should filter by environment', () => {
    cy.visit('/feature-flags')
    cy.get('select[name="environment"], select[id="env-filter"]').select('Development')
    cy.contains('New Dashboard').should('be.visible')
  })

  it('should navigate to flag detail', () => {
    cy.visit('/feature-flags')
    cy.contains('Dark Mode').click()
    cy.url().should('include', '/feature-flags/')
    cy.contains('Flag Details').should('be.visible')
  })

  it('should update flag value', () => {
    cy.visit('/feature-flags')
    cy.contains('Welcome Message').click()
    cy.get('input[name="defaultValue"]').clear().type('Updated Welcome!')
    cy.get('button').contains(/save|update/i).click()
    cy.contains('Updated Welcome!').should('be.visible')
  })

  it('should add targeting rule', () => {
    cy.visit('/feature-flags')
    cy.contains('New Dashboard').click()
    cy.contains('Targeting Rules').click()
    cy.get('button').contains(/add rule|new rule/i).click()
    cy.get('input[name="ruleName"]').type('Test Rule')
    cy.get('select[name="attribute"]').select('userId')
    cy.get('select[name="operator"]').select('equals')
    cy.get('input[name="value"]').type('123')
    cy.get('button').contains(/save rule/i).click()
    cy.contains('Test Rule').should('be.visible')
  })

  it('should delete feature flag', () => {
    // Create a flag first
    cy.visit('/projects')
    cy.contains('Demo Project').click()
    const flagName = `Delete Flag ${Date.now()}`
    cy.get('button').contains(/new feature flag/i).click()
    cy.get('input[name="name"]').first().type(flagName)
    cy.get('input[name="key"]').first().type(`delete-${Date.now()}`)
    cy.get('button[type="submit"]').contains(/create/i).click()
    cy.contains(flagName).should('be.visible')
    
    // Delete it
    cy.contains(flagName).parents('tr, [class*="card"]').first()
      .find('button').contains(/delete/i).click({ force: true })
    cy.get('button').contains(/confirm|yes/i).click()
    cy.contains(flagName).should('not.exist')
  })
})
