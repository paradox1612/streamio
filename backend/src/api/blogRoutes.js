const router = require('express').Router();
const { blogPostQueries } = require('../db/queries');

function mapPost(row) {
  if (!row) return null;

  const readTimeMatch = /^<!--\s*readTime:(.*?)\s*-->\n?/m.exec(row.content || '');
  const readTime = readTimeMatch ? readTimeMatch[1].trim() : null;
  const content = (row.content || '').replace(/^<!--\s*readTime:.*?-->\n?/m, '');

  return {
    ...row,
    read_time: readTime,
    content,
  };
}

router.get('/', async (_req, res) => {
  const posts = await blogPostQueries.listPublished();
  res.json(posts.map(mapPost));
});

router.get('/featured', async (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '3', 10), 12));
  const posts = await blogPostQueries.listFeatured(limit);
  res.json(posts.map(mapPost));
});

router.get('/:slug', async (req, res) => {
  const post = await blogPostQueries.findBySlug(req.params.slug);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json(mapPost(post));
});

module.exports = router;
