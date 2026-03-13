import '@cypress/code-coverage/support'

// Custom commands for Flagify
declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>
      createOrganization(name: string): Chainable<string>
      createProject(orgId: string, name: string): Chainable<string>
      createFeatureFlag(projectId: string, name: string, key: string): Chainable<string>
    }
  }
}

Cypress.Commands.add('login', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.visit('/login')
    cy.get('input[type="email"]').type(email)
    cy.get('input[type="password"]').type(password)
    cy.get('button[type="submit"]').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
  })
})

Cypress.Commands.add('createOrganization', (name: string) => {
  cy.get('button').contains(/new organization|create organization/i).click()
  cy.get('input[name="name"], #org-name, input[placeholder*="name" i]').first().type(name)
  cy.get('button[type="submit"]').contains(/create|save/i).click()
  cy.contains(name).should('be.visible')
  
  // Extract org ID from URL
  return cy.url().then((url) => {
    const match = url.match(/\/organizations\/([a-f0-9]{24})/)
    return match ? match[1] : ''
  })
})

Cypress.Commands.add('createProject', (orgId: string, name: string) => {
  cy.visit(`/organizations/${orgId}`)
  cy.get('button').contains(/new project|create project/i).click()
  cy.get('input[name="name"], #project-name').first().type(name)
  cy.get('input[name="key"], #project-key').first().type(name.toLowerCase().replace(/\s+/g, '-'))
  cy.get('button[type="submit"]').contains(/create|save/i).click()
  cy.contains(name).should('be.visible')
  
  return cy.url().then((url) => {
    const match = url.match(/\/projects\/([a-f0-9]{24})/)
    return match ? match[1] : ''
  })
})

Cypress.Commands.add('createFeatureFlag', (projectId: string, name: string, key: string) => {
  cy.visit(`/projects/${projectId}`)
  cy.get('button').contains(/new feature flag|create feature flag/i).click()
  cy.get('input[name="name"], #flag-name').first().type(name)
  cy.get('input[name="key"], #flag-key').first().type(key)
  cy.get('select[name="type"], #flag-type').select('BOOLEAN')
  cy.get('button[type="submit"]').contains(/create|save/i).click()
  cy.contains(name).should('be.visible')
  
  return cy.url().then((url) => {
    const match = url.match(/\/feature-flags\/([a-f0-9]{24})/)
    return match ? match[1] : ''
  })
})
