const Parser = require('rss-parser');
const axios = require('axios');

const parser = new Parser({
  timeout: 10000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['enclosure', 'enclosure', { keepArray: false }]
    ]
  }
});

const fetchRSSFeed = async (rssUrl, sourceName) => {
  try {
    const feed = await parser.parseURL(rssUrl);
    
    if (!feed || !feed.items || feed.items.length === 0) {
      return { success: false, articles: [], error: 'Empty feed' };
    }

    const articles = feed.items.map(item => {
      let imageUrl = null;

      if (item.mediaContent && item.mediaContent.length > 0) {
        imageUrl = item.mediaContent[0].$.url || item.mediaContent[0];
      } else if (item.mediaThumbnail && item.mediaThumbnail.length > 0) {
        imageUrl = item.mediaThumbnail[0].$.url || item.mediaThumbnail[0];
      } else if (item.enclosure && item.enclosure.type && item.enclosure.type.startsWith('image/')) {
        imageUrl = item.enclosure.url;
      } else if (item.contentSnippet) {
        const imgMatch = item.contentSnippet.match(/<img[^>]+src="([^"]+)"/i);
        if (imgMatch) imageUrl = imgMatch[1];
      }

      const publishedDate = item.pubDate 
        ? new Date(item.pubDate) 
        : (item.isoDate ? new Date(item.isoDate) : new Date());

      const content = item.contentSnippet || item.content || item.summary || '';
      const excerpt = item.contentSnippet || item.summary || content.substring(0, 300) || '';

      return {
        title: item.title || 'Untitled',
        content: content,
        excerpt: excerpt.length > 500 ? excerpt.substring(0, 500) : excerpt,
        url: item.link || item.guid || '',
        image_url: imageUrl,
        published_at: publishedDate
      };
    }).filter(article => article.url && article.title);

    return { success: true, articles, error: null };
  } catch (error) {
    console.error(`RSS fetch error for ${sourceName}:`, error.message);
    return { 
      success: false, 
      articles: [], 
      error: error.message || 'Unknown RSS error' 
    };
  }
};

module.exports = {
  fetchRSSFeed
};

