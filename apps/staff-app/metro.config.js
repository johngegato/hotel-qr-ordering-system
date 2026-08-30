const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// 1. Watch all files in the monorepo while preserving default entries
config.watchFolders = [...(config.watchFolders || []), workspaceRoot]

// 2. Resolve modules from project first, then monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// 3. Enable standard hierarchical lookup so PNPM symlinked modules are resolved correctly
config.resolver.disableHierarchicalLookup = false

module.exports = config
