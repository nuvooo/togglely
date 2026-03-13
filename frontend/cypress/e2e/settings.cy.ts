describe('Settings', () => {
  beforeEach(() => {
    cy.login('demo@flagify.io', 'demo1234')
    cy.visit('/settings')
  })

  it('should display settings page', () => {
    cy.contains('Settings').should('be.visible')
    cy.contains('Profile Information').should('be.visible')
  })

  it('should update profile name', () => {
    cy.get('input[name="name"], input[id="profile-name"]').clear().type('Updated Name')
    cy.get('button').contains(/save|update/i).click()
    cy.contains(/profile updated|success/i).should('be.visible')
    cy.contains('Updated Name').should('be.visible')
  })

  it('should update email', () => {
    cy.get('input[type="email"]').clear().type('updated@example.com')
    cy.get('button').contains(/save|update/i).click()
    cy.contains(/profile updated|success/i).should('be.visible')
  })

  it('should show password change form', () => {
    cy.get('button').contains(/change password|password/i).click()
    cy.get('input[type="password"]').should('be.visible')
  })

  it('should validate password requirements', () => {
    cy.get('button').contains(/change password/i).click()
    cy.get('input[name="currentPassword"]').type('demo1234')
    cy.get('input[name="newPassword"]').type('short')
    cy.get('input[name="confirmPassword"]').type('short')
    cy.get('button').contains(/update password/i).click()
    cy.contains(/password must be at least|invalid/i).should('be.visible')
  })

  it('should toggle email notifications', () => {
    cy.get('input[type="checkbox"][name="emailNotifications"]').click()
    cy.get('button').contains(/save|update/i).click()
    cy.contains(/preferences saved|success/i).should('be.visible')
  })

  it('should change language', () => {
    cy.get('select[name="language"]').select('de')
    cy.get('button').contains(/save/i).click()
    cy.contains(/success/i).should('be.visible')
  })

  it('should change timezone', () => {
    cy.get('select[name="timezone"]').select('Europe/Berlin')
    cy.get('button').contains(/save/i).click()
    cy.contains(/success/i).should('be.visible')
  })
})
