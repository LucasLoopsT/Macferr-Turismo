/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true, // obrigatório para export estático
  },
  // Se seu repo GitHub se chamar "macferr" e não for o root:
  // basePath: '/macferr',
  // assetPrefix: '/macferr/',
};

module.exports = nextConfig;
