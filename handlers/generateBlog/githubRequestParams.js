module.exports = {
  auth: process.env.GITHUB_USER && process.env.GITHUB_PASSWORD ?
    `${process.env.GITHUB_USER}:${process.env.GITHUB_PASSWORD}` :
    undefined,
  headers: {
    'User-Agent': 'Serverless Blog'
  }
};
