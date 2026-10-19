// `ondine` lists `vite@^8` as an optional peer, which stops pnpm from auto-installing `vite@7` for the other plugins.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'ondine') delete pkg.peerDependencies?.vite
      return pkg
    },
  },
}
