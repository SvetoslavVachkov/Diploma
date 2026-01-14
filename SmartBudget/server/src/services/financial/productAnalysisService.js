const axios = require('axios');
const { Product, ReceiptProduct } = require('../../models');
const { Op } = require('sequelize');

const normalizeProductName = (name) => {
  return name.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
};

const analyzeProductWithOpenAI = async (productName, productList, apiKey, model = 'gpt-4o-mini') => {
  if (!apiKey) {
    return null;
  }

  try {
    const prompt = `You are an expert product analyzer. Analyze the following product name from a receipt and extract information.

Product name: "${productName}"

Product list from receipt:
${productList.map((p, i) => `${i + 1}. ${p.name || p.product_name || p}`).join('\n')}

Return ONLY valid JSON with these EXACT keys (no markdown, no explanations):
{
  "category": "string (e.g., Food, Beverages, Groceries, Electronics, Clothing, Health, etc.)",
  "subcategory": "string (e.g., Pizza, Vegetables, Fruits, Soft drinks, etc.)",
  "health_info": {
    "is_healthy": boolean,
    "calories_per_100g": number or null,
    "health_rating": "excellent|good|moderate|poor|unhealthy",
    "nutrients": ["protein", "fiber", "vitamins"] or [],
    "concerns": ["high_sugar", "high_sodium", "processed", "trans_fats"] or [],
    "benefits": ["high_protein", "low_calorie", "antioxidants"] or []
  },
  "tips": {
    "health_tip": "string with health advice in Bulgarian",
    "budget_tip": "string with money saving advice in Bulgarian if applicable",
    "alternative": "string with healthier or cheaper alternative in Bulgarian if applicable"
  }
}

Rules:
- Be specific with categories. If it's pizza, category should be "Food" and subcategory should be "Pizza".
- If product name contains multiple items, analyze the main item.
- If you cannot determine category, use "Other".
- Health info should be realistic. If unknown, use null for calories and empty arrays.
- Tips should be practical and in Bulgarian.
- Health rating should be based on common knowledge about the product.`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert product analyzer. Always return valid JSON only, no markdown, no explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 800
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message?.content?.trim() || '';
      if (content) {
        try {
          let parsed;
          if (typeof content === 'string') {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            } else {
              parsed = JSON.parse(content);
            }
          } else {
            parsed = content;
          }
          
          if (parsed && typeof parsed === 'object') {
            return {
              category: parsed.category || 'Other',
              subcategory: parsed.subcategory || null,
              health_info: parsed.health_info || {
                is_healthy: null,
                calories_per_100g: null,
                health_rating: 'moderate',
                nutrients: [],
                concerns: [],
                benefits: []
              },
              tips: parsed.tips || {
                health_tip: null,
                budget_tip: null,
                alternative: null
              }
            };
          }
        } catch (parseError) {
          return null;
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

const analyzeProductsFromReceipt = async (receiptText, apiKey, model) => {
  if (!apiKey || !receiptText) {
    return null;
  }

  try {
    const prompt = `You are an expert receipt parser. Extract all products from the following receipt text.

Receipt text:
${receiptText.substring(0, 4000)}

Return ONLY valid JSON with this EXACT structure (no markdown, no explanations):
{
  "merchant": "string (merchant/store name)",
  "amount_eur": number (total amount in EUR),
  "date": "YYYY-MM-DD or null",
  "products": [
    {
      "name": "string (product name)",
      "quantity": number (default 1.0 if not specified),
      "unit_price": number or null,
      "total_price": number (product price)
    }
  ]
}

Rules:
- Extract ALL products from the receipt, not just the total.
- If quantity is not specified, use 1.0.
- If unit_price cannot be determined, set it to null.
- total_price is required for each product in EUR.
- Prefer the real merchant name (e.g., "Domino's Pizza") over printer brands.
- Extract date if available.
- CRITICAL: Check if receipt shows EUR (€, EUR). If yes, use EUR amounts directly.
- If receipt shows ONLY BGN (лв, BGN) with NO EUR mentioned, convert BGN to EUR using rate 1.95583 (divide BGN by 1.95583).
- If receipt shows both BGN and EUR (e.g., "19.17 BGN (9.80 EUR)"), ALWAYS use the EUR amount.
- NEVER assume BGN amounts are EUR. Only use EUR if explicitly shown or convert from BGN.
- amount_eur must be in EUR, not BGN.`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert receipt parser. Always return valid JSON only, no markdown, no explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    if (response.data && response.data.choices && response.data.choices.length > 0) {
      const content = response.data.choices[0].message?.content?.trim() || '';
      if (content) {
        try {
          let parsed;
          if (typeof content === 'string') {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsed = JSON.parse(jsonMatch[0]);
            } else {
              parsed = JSON.parse(content);
            }
          } else {
            parsed = content;
          }
          
          if (parsed && typeof parsed === 'object' && parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
            let amountEur = parsed.amount_eur || null;
            
            const receiptLower = receiptText.toLowerCase();
            const hasEUR = receiptLower.includes('eur') || receiptLower.includes('€') || receiptLower.includes('евро');
            const hasBGN = receiptLower.includes('bgn') || receiptLower.includes('лв') || receiptLower.includes('лева');
            
            let needsConversion = false;
            if (hasBGN && !hasEUR) {
              needsConversion = true;
            }
            
            if (amountEur && amountEur > 0 && needsConversion && (amountEur > 100 || amountEur < 0.5)) {
              amountEur = amountEur / 1.95583;
            }

            const convertedProducts = parsed.products.map(p => {
              let totalPrice = parseFloat(p.total_price) || 0;
              
              if (needsConversion && totalPrice > 0) {
                if (totalPrice > 100 || totalPrice < 0.5) {
                  totalPrice = totalPrice / 1.95583;
                }
              }
              
              return {
                ...p,
                total_price: totalPrice > 0 ? totalPrice : parseFloat(p.total_price) || 0
              };
            });

            const convertedTotal = convertedProducts.reduce((sum, p) => sum + (p.total_price || 0), 0);
            if (convertedTotal > 0) {
              if (!amountEur || amountEur <= 0) {
                amountEur = convertedTotal;
              } else if (needsConversion && Math.abs(amountEur - convertedTotal) > convertedTotal * 0.5) {
                amountEur = convertedTotal;
              }
            }

            return {
              merchant: parsed.merchant || null,
              amount_eur: amountEur,
              date: parsed.date || null,
              products: convertedProducts.filter(p => p.name && p.total_price && p.total_price > 0)
            };
          }
        } catch (parseError) {
          return null;
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

const findOrCreateProduct = async (productName, analysis) => {
  const normalized = normalizeProductName(productName);
  
  let product = await Product.findOne({
    where: {
      normalized_name: normalized
    }
  });

  if (!product) {
    product = await Product.create({
      name: productName,
      normalized_name: normalized,
      category: analysis?.category || null,
      subcategory: analysis?.subcategory || null,
      health_info: analysis?.health_info || null,
      tips: analysis?.tips || null
    });
  } else {
    if (analysis && (!product.category || !product.subcategory)) {
      product.category = analysis.category || product.category;
      product.subcategory = analysis.subcategory || product.subcategory;
      product.health_info = analysis.health_info || product.health_info;
      product.tips = analysis.tips || product.tips;
      await product.save();
    }
  }

  return product;
};

const createReceiptProducts = async (transactionId, products, apiKey, model) => {
  if (!products || products.length === 0) {
    return [];
  }

  const receiptProducts = [];

  const productNames = products.map(p => p.name || p.product_name || p);
  
  for (const productData of products) {
    const productName = productData.name || productData.product_name || '';
    if (!productName || !productData.total_price) {
      continue;
    }

    let analysis = null;
    if (apiKey) {
      analysis = await analyzeProductWithOpenAI(productName, productNames, apiKey, model);
    }

    const product = await findOrCreateProduct(productName, analysis);

    const receiptProduct = await ReceiptProduct.create({
      transaction_id: transactionId,
      product_id: product.id,
      product_name: productName,
      quantity: productData.quantity || 1.0,
      unit_price: productData.unit_price || null,
      total_price: productData.total_price,
      category: analysis?.category || product.category || null,
      subcategory: analysis?.subcategory || product.subcategory || null,
      health_info: analysis?.health_info || product.health_info || null,
      tips: analysis?.tips || product.tips || null
    });

    receiptProducts.push(receiptProduct);
  }

  return receiptProducts;
};

module.exports = {
  analyzeProductWithOpenAI,
  analyzeProductsFromReceipt,
  findOrCreateProduct,
  createReceiptProducts
};

