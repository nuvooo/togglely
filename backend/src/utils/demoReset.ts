import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function resetDemoData() {
  console.log('🔄 Resetting demo data...');

  try {
    // 1. Find the demo user
    const demoUser = await prisma.user.findUnique({
      where: { email: 'demo@togglely.io' }
    });

    if (demoUser) {
      // 2. Find all members where the user is (to find orgs)
      const demoMembers = await prisma.organizationMember.findMany({
        where: { userId: demoUser.id },
        select: { organizationId: true }
      });

      const memberOrgIds = demoMembers.map(m => m.organizationId);

      // Also find all organizations with the actual demo slug just to be safe
      const slugOrgs = await prisma.organization.findMany({
        where: { slug: 'demo-organization' },
        select: { id: true }
      });
      
      const slugOrgIds = slugOrgs.map(o => o.id);
      
      // Combine IDs
      const orgIds = Array.from(new Set([...memberOrgIds, ...slugOrgIds]));

      if (orgIds.length > 0) {
        // 3. Delete everything associated with those organizations
        // Delete Audit Logs
        await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
        // Delete API Keys
        await prisma.apiKey.deleteMany({ where: { organizationId: { in: orgIds } } });
        
        // Find all projects to delete brands
        const projects = await prisma.project.findMany({
          where: { organizationId: { in: orgIds } },
          select: { id: true }
        });
        const projectIds = projects.map(p => p.id);

        if (projectIds.length > 0) {
          // Delete Flags and cascading relations correctly for MongoDB
          const flags = await prisma.featureFlag.findMany({
            where: { projectId: { in: projectIds } }
          });
          const flagIds = flags.map(f => f.id);

          if (flagIds.length > 0) {
            const flagEnvs = await prisma.flagEnvironment.findMany({
              where: { flagId: { in: flagIds } }
            });
            const flagEnvIds = flagEnvs.map(fe => fe.id);

            if (flagEnvIds.length > 0) {
              const rules = await prisma.targetingRule.findMany({
                where: { flagEnvId: { in: flagEnvIds } }
              });
              const ruleIds = rules.map(r => r.id);

              if (ruleIds.length > 0) {
                await prisma.ruleCondition.deleteMany({ where: { ruleId: { in: ruleIds } } });
                await prisma.targetingRule.deleteMany({ where: { id: { in: ruleIds } } });
              }
              await prisma.flagEnvironment.deleteMany({ where: { id: { in: flagEnvIds } } });
            }
            await prisma.featureFlag.deleteMany({ where: { id: { in: flagIds } } });
          }

          // Delete Brands (assigned to projects)
          await prisma.brand.deleteMany({ where: { projectId: { in: projectIds } } });
        }

        // Delete Environments
        await prisma.environment.deleteMany({ where: { organizationId: { in: orgIds } } });
        // Delete Projects
        await prisma.project.deleteMany({ where: { organizationId: { in: orgIds } } });
        
        // First delete memberships (FK constraint), then organizations
        await prisma.organizationMember.deleteMany({ where: { organizationId: { in: orgIds } } });
        
        // Final: Delete the Organizations themselves
        await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      }

      // 4. Re-create the seed data
      const hashedPassword = await hashPassword('demo1234');
      
      // Update user password and name just in case it was changed
      await prisma.user.update({
        where: { id: demoUser.id },
        data: {
          firstName: 'Demo',
          lastName: 'User',
          password: hashedPassword
        }
      });

      // Create organization
      const org = await prisma.organization.create({
        data: {
          name: 'Demo Organization',
          slug: 'demo-organization',
          description: 'A demo organization for testing'
        }
      });

      // Add user as owner
      await prisma.organizationMember.create({
        data: {
          userId: demoUser.id,
          organizationId: org.id,
          role: 'OWNER'
        }
      });

      // ============================================
      // PROJECT 1: Simple Project (Single Tenant)
      // ============================================
      const simpleProject = await prisma.project.create({
        data: {
          name: 'Simple Web App',
          key: 'simple-web-app',
          description: 'A simple single-tenant web application',
          organizationId: org.id
        }
      });

      // Create environments for simple project
      const simpleDevEnv = await prisma.environment.create({
        data: {
          name: 'Development',
          key: 'development',
          projectId: simpleProject.id,
          organizationId: org.id,
          sortOrder: 0
        }
      });

      const simpleProdEnv = await prisma.environment.create({
        data: {
          name: 'Production',
          key: 'production',
          projectId: simpleProject.id,
          organizationId: org.id,
          sortOrder: 1
        }
      });

      // Create sample feature flags for simple project
      const simpleFlags = [
        {
          name: 'New Dashboard',
          key: 'new-dashboard',
          description: 'Enable the new dashboard UI',
          flagType: 'BOOLEAN' as const,
          devEnabled: true,
          prodEnabled: false,
          defaultValue: 'false'
        },
        {
          name: 'Dark Mode',
          key: 'dark-mode',
          description: 'Enable dark mode theme',
          flagType: 'BOOLEAN' as const,
          devEnabled: true,
          prodEnabled: true,
          defaultValue: 'true'
        },
        {
          name: 'Beta Features',
          key: 'beta-features',
          description: 'Enable beta feature access',
          flagType: 'BOOLEAN' as const,
          devEnabled: true,
          prodEnabled: false,
          defaultValue: 'false'
        }
      ];

      for (const flagData of simpleFlags) {
        await prisma.featureFlag.create({
          data: {
            name: flagData.name,
            key: flagData.key,
            description: flagData.description,
            flagType: flagData.flagType,
            organizationId: org.id,
            projectId: simpleProject.id,
            createdById: demoUser.id,
            flagEnvironments: {
              create: [
                {
                  environmentId: simpleDevEnv.id,
                  enabled: flagData.devEnabled,
                  defaultValue: flagData.defaultValue
                },
                {
                  environmentId: simpleProdEnv.id,
                  enabled: flagData.prodEnabled,
                  defaultValue: flagData.defaultValue
                }
              ]
            }
          }
        });
      }

      // ============================================
      // PROJECT 2: Multi-Tenant SaaS (with Brands)
      // ============================================
      const saasProject = await prisma.project.create({
        data: {
          name: 'Multi-Tenant SaaS',
          key: 'multi-tenant-saas',
          description: 'A multi-tenant SaaS platform with brand-specific feature flags',
          type: 'MULTI',
          organizationId: org.id
        }
      });

      // Create environments for SaaS project
      const saasDevEnv = await prisma.environment.create({
        data: {
          name: 'Development',
          key: 'development',
          projectId: saasProject.id,
          organizationId: org.id,
          sortOrder: 0
        }
      });

      const saasProdEnv = await prisma.environment.create({
        data: {
          name: 'Production',
          key: 'production',
          projectId: saasProject.id,
          organizationId: org.id,
          sortOrder: 1
        }
      });

      // Create brands (tenants) for SaaS project
      const brands = await Promise.all([
        prisma.brand.create({
          data: {
            name: 'Acme Corp',
            key: 'acme-corp',
            description: 'Enterprise customer',
            projectId: saasProject.id
          }
        }),
        prisma.brand.create({
          data: {
            name: 'Startup Inc',
            key: 'startup-inc',
            description: 'Startup plan customer',
            projectId: saasProject.id
          }
        }),
        prisma.brand.create({
          data: {
            name: 'Global Tech',
            key: 'global-tech',
            description: 'Premium enterprise customer',
            projectId: saasProject.id
          }
        })
      ]);

      const [acmeBrand, startupBrand, globalBrand] = brands;

      // Create multi-tenant feature flags
      const saasFlags = [
        {
          name: 'Premium Features',
          key: 'premium-features',
          description: 'Access to premium features',
          flagType: 'BOOLEAN' as const,
          // Global defaults
          devEnabled: true,
          prodEnabled: false,
          defaultValue: 'false',
          // Brand overrides for production
          brandOverrides: [
            { brandId: globalBrand.id, enabled: true, value: 'true' },  // Global Tech gets premium
            { brandId: acmeBrand.id, enabled: true, value: 'true' },    // Acme gets premium
            { brandId: startupBrand.id, enabled: false, value: 'false' } // Startup doesn't
          ]
        },
        {
          name: 'AI Assistant',
          key: 'ai-assistant',
          description: 'AI-powered assistant feature',
          flagType: 'BOOLEAN' as const,
          devEnabled: true,
          prodEnabled: true,
          defaultValue: 'true',
          brandOverrides: [
            { brandId: globalBrand.id, enabled: true, value: 'true' },
            { brandId: acmeBrand.id, enabled: false, value: 'false' },  // Acme opted out
            { brandId: startupBrand.id, enabled: true, value: 'true' }
          ]
        },
        {
          name: 'Max Users',
          key: 'max-users',
          description: 'Maximum number of users per tenant',
          flagType: 'NUMBER' as const,
          devEnabled: true,
          prodEnabled: true,
          defaultValue: '10',
          brandOverrides: [
            { brandId: globalBrand.id, enabled: true, value: '1000' },  // Enterprise: 1000
            { brandId: acmeBrand.id, enabled: true, value: '100' },    // Business: 100
            { brandId: startupBrand.id, enabled: true, value: '10' }   // Startup: 10
          ]
        },
        {
          name: 'API Rate Limit',
          key: 'api-rate-limit',
          description: 'API requests per minute',
          flagType: 'NUMBER' as const,
          devEnabled: true,
          prodEnabled: true,
          defaultValue: '100',
          brandOverrides: [
            { brandId: globalBrand.id, enabled: true, value: '10000' },
            { brandId: acmeBrand.id, enabled: true, value: '5000' },
            { brandId: startupBrand.id, enabled: true, value: '1000' }
          ]
        }
      ];

      for (const flagData of saasFlags) {
        // Create the flag
        const flag = await prisma.featureFlag.create({
          data: {
            name: flagData.name,
            key: flagData.key,
            description: flagData.description,
            flagType: flagData.flagType,
            organizationId: org.id,
            projectId: saasProject.id,
            createdById: demoUser.id
          }
        });

        // Create global flag environments (no brand = defaults)
        await prisma.flagEnvironment.createMany({
          data: [
            {
              flagId: flag.id,
              environmentId: saasDevEnv.id,
              enabled: flagData.devEnabled,
              defaultValue: flagData.defaultValue
            },
            {
              flagId: flag.id,
              environmentId: saasProdEnv.id,
              enabled: flagData.prodEnabled,
              defaultValue: flagData.defaultValue
            }
          ]
        });

        // Create brand-specific overrides
        for (const override of flagData.brandOverrides) {
          await prisma.flagEnvironment.createMany({
            data: [
              {
                flagId: flag.id,
                environmentId: saasDevEnv.id,
                brandId: override.brandId,
                enabled: true, // Always enabled in dev
                defaultValue: override.value
              },
              {
                flagId: flag.id,
                environmentId: saasProdEnv.id,
                brandId: override.brandId,
                enabled: override.enabled,
                defaultValue: override.value
              }
            ]
          });
        }
      }

      // Note: Targeting rules with custom attributes (like 'plan', 'userGroup') 
      // require setting SDK context via client.setContext({ plan: 'premium' })
      // This is not shown in the demo UI but can be done programmatically

      // Create API keys for both projects
      await prisma.apiKey.create({
        data: {
          name: 'Simple Web App SDK Key',
          key: 'togglely_demo_simple_key',
          type: 'SDK',
          organizationId: org.id,
          userId: demoUser.id
        }
      });

      await prisma.apiKey.create({
        data: {
          name: 'Multi-Tenant SaaS SDK Key',
          key: 'togglely_demo_saas_key',
          type: 'SDK',
          organizationId: org.id,
          userId: demoUser.id
        }
      });

      console.log('✅ Demo data reset successfully');
      console.log('   📁 Simple Web App (demo-project)');
      console.log('   🏢 Multi-Tenant SaaS with 3 brands: Acme Corp, Startup Inc, Global Tech');
    }
  } catch (error) {
    console.error('❌ Demo data reset failed:', error);
  }
}
