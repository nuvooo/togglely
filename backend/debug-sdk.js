// Debug script for SDK - run on production to check actual data
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  console.log('=== Debugging SDK Data ===\n');
  
  // List all projects
  const projects = await prisma.project.findMany({ select: { id: true, key: true, name: true, type: true } });
  console.log('All Projects:', projects);
  
  // List all feature flags  
  const flags = await prisma.featureFlag.findMany({ 
    take: 10,
    select: { id: true, key: true, name: true, projectId: true, flagType: true }
  });
  console.log('\nAll Flags (first 10):', flags);
  
  // List all brands
  const brands = await prisma.brand.findMany({
    select: { id: true, key: true, name: true, projectId: true }
  });
  console.log('\nAll Brands:', brands);
  
  // List all flag environments
  const envs = await prisma.flagEnvironment.findMany({
    take: 20,
    select: { 
      id: true, 
      flagId: true, 
      environmentId: true, 
      brandId: true, 
      enabled: true, 
      defaultValue: true 
    }
  });
  console.log('\nAll FlagEnvironments (first 20):', envs);
  
  await prisma.$disconnect();
}

debug().catch(console.error);
