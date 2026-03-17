const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.log('=== SDK Integration Test ===\n');
  
  // 1. Projekt finden
  const project = await prisma.project.findFirst({ where: { key: 'orbit' } });
  console.log('Project:', project ? { id: project.id, key: project.key, type: project.type } : 'NOT FOUND');
  
  if (!project) {
    console.log('ERROR: Project orbit not found!');
    process.exit(1);
  }
  
  // 2. Environment finden
  const env = await prisma.environment.findFirst({ 
    where: { projectId: project.id, key: 'development' } 
  });
  console.log('Environment:', env ? { id: env.id, key: env.key } : 'NOT FOUND');
  
  // 3. Flag finden
  const flag = await prisma.featureFlag.findFirst({ 
    where: { projectId: project.id, key: 'ki-search' } 
  });
  console.log('Flag:', flag ? { id: flag.id, key: flag.key, flagType: flag.flagType } : 'NOT FOUND');
  
  // 4. Brand finden
  const brand = await prisma.brand.findFirst({ 
    where: { projectId: project.id, key: 'muffenrohr' } 
  });
  console.log('Brand:', brand ? { id: brand.id, key: brand.key } : 'NOT FOUND');
  
  // 5. FlagEnvironment suchen (mit Brand)
  if (flag && env) {
    const feBrand = await prisma.flagEnvironment.findFirst({
      where: { 
        flagId: flag.id, 
        environmentId: env.id,
        brandId: brand ? brand.id : null
      }
    });
    console.log('\nFlagEnvironment (with brand muffenrohr):', feBrand ? { 
      id: feBrand.id, 
      enabled: feBrand.enabled, 
      defaultValue: feBrand.defaultValue,
      brandId: feBrand.brandId
    } : 'NOT FOUND');
    
    // 6. FlagEnvironment suchen (ohne Brand - default)
    const feDefault = await prisma.flagEnvironment.findFirst({
      where: { 
        flagId: flag.id, 
        environmentId: env.id,
        brandId: null
      }
    });
    console.log('FlagEnvironment (default, no brand):', feDefault ? { 
      id: feDefault.id, 
      enabled: feDefault.enabled, 
      defaultValue: feDefault.defaultValue,
      brandId: feDefault.brandId
    } : 'NOT FOUND');
    
    // 7. Alle FlagEnvironments für diesen Flag
    const allFe = await prisma.flagEnvironment.findMany({
      where: { flagId: flag.id, environmentId: env.id },
      include: { brand: true }
    });
    console.log('\nAll FlagEnvironments for ki-search/development:');
    allFe.forEach(fe => {
      console.log('  -', { 
        id: fe.id, 
        enabled: fe.enabled, 
        brandId: fe.brandId,
        brandName: fe.brand?.name || 'default'
      });
    });
  }
  
  await prisma.$disconnect();
}

test().catch(e => { console.error(e); process.exit(1); });
