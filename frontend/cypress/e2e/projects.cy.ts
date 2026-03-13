describe('Projects', () => {
  beforeEach(() => {
    cy.login('demo@flagify.io', 'demo1234')
    cy.visit('/projects')
  })

  it('should display projects list', () => {
    cy.contains('Projects').should('be.visible')
    cy.contains('Demo Project').should('be.visible')
  })

  it('should create new project', () => {
    const projectName = `Test Project ${Date.now()}`
    cy.get('button').contains(/new project|create project/i).click()
    
    // Select organization
    cy.get('select[name="organizationId"], select[id="project-org"]').select('Demo Organization')
    
    cy.get('input[name="name"], input[id="project-name"]').first().type(projectName)
    cy.get('input[name="key"], input[id="project-key"]').first().type(projectName.toLowerCase().replace(/\s+/g, '-'))
    cy.get('button[type="submit"]').contains(/create|save/i).click()
    cy.contains(projectName).should('be.visible')
  })

  it('should search projects', () => {
    cy.get('input[placeholder*="search" i]').type('Demo')
    cy.contains('Demo Project').should('be.visible')
  })

  it('should navigate to project detail', () => {
    cy.contains('Demo Project').click()
    cy.url().should('include', '/projects/')
    cy.contains('Project Overview').should('be.visible')
  })

  it('should display project environments', () => {
    cy.contains('Demo Project').click()
    cy.contains('Environments').should('be.visible')
    cy.contains('Development').should('be.visible')
    cy.contains('Production').should('be.visible')
  })

  it('should display project feature flags', () => {
    cy.contains('Demo Project').click()
    cy.contains('Feature Flags').should('be.visible')
  })

  it('should filter projects by organization', () => {
    cy.get('select[name="organization"], select[id="org-filter"]').select('Demo Organization')
    cy.contains('Demo Project').should('be.visible')
  })

  it('should delete project', () => {
    // First create a project
    const projectName = `Delete Project ${Date.now()}`
    cy.get('button').contains(/new project/i).click()
    cy.get('select[name="organizationId"]').select('Demo Organization')
    cy.get('input[name="name"]').first().type(projectName)
    cy.get('input[name="key"]').first().type(`delete-${Date.now()}`)
    cy.get('button[type="submit"]').contains(/create/i).click()
    cy.contains(projectName).should('be.visible')
    
    // Now delete it
    cy.contains(projectName).parents('tr, [class*="card"]').first()
      .find('button').contains(/delete/i).click({ force: true })
    cy.get('button').contains(/confirm|yes/i).click()
    cy.contains(projectName).should('not.exist')
  })
})
