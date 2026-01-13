# Receipt Products Analysis Feature

This feature adds AI-powered product extraction and analysis from receipts using Groq API.

## What Was Implemented

### 1. Database Schema
- Added `products` table to store product information (name, category, health info, tips)
- Added `receipt_products` table to link products to transactions

### 2. Models
- `Product` model - stores product information
- `ReceiptProduct` model - links products to transactions with quantity, price, health info, and tips

### 3. Services
- `productAnalysisService.js` - Analyzes products using Groq AI
  - `analyzeProductWithGroq` - Analyzes individual products for category, health info, and tips
  - `analyzeProductsFromReceipt` - Extracts all products from receipt text
  - `findOrCreateProduct` - Finds or creates product records
  - `createReceiptProducts` - Creates receipt product records linked to transactions

### 4. Updated Services
- `receiptAiParseService.js` - Updated to use Groq for product extraction with fallback to Hugging Face
- `receiptScanService.js` - Updated to extract products and store them in database
- `transactionService.js` - Updated to include products in transaction queries

## Features

### Product Extraction
- AI extracts all products from receipt text
- Identifies product names, quantities, unit prices, and total prices
- Extracts merchant name and transaction date

### Product Analysis
- Categorizes products (Food, Beverages, Electronics, etc.)
- Identifies subcategories (Pizza, Vegetables, Fruits, etc.)
- Analyzes health information:
  - Health rating (excellent, good, moderate, poor, unhealthy)
  - Calories per 100g (when available)
  - Nutrients (protein, fiber, vitamins)
  - Concerns (high sugar, high sodium, processed, trans fats)
  - Benefits (high protein, low calorie, antioxidants)

### Health Tips
- Provides health advice for each product in Bulgarian
- Suggests healthier alternatives
- Provides budget-saving tips when applicable

### Product Storage
- Products are stored in database for future reference
- Receipt products are linked to transactions
- Health info and tips are stored with each product

## Configuration

Add to `.env` file:
```
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant
```

See `GROQ_SETUP.md` for detailed setup instructions.

## Usage

When scanning a receipt:
1. System extracts text from receipt image or text file
2. AI analyzes receipt text to extract products
3. Each product is analyzed for category, health info, and tips
4. Transaction is created with products linked
5. Products are stored in database for future analysis

## API Response

Transaction endpoints now include `products` array:
```json
{
  "id": "transaction-id",
  "description": "Merchant - Product 1, Product 2",
  "amount": 25.50,
  "category": {...},
  "products": [
    {
      "id": "product-id",
      "product_name": "Pizza Margherita",
      "quantity": 1.0,
      "unit_price": 15.00,
      "total_price": 15.00,
      "category": "Food",
      "subcategory": "Pizza",
      "health_info": {
        "health_rating": "moderate",
        "calories_per_100g": 250,
        "nutrients": ["protein"],
        "concerns": ["high_sodium", "processed"]
      },
      "tips": {
        "health_tip": "Пицата е умерено здравословна. Опитайте се да я консумирате умерено.",
        "alternative": "За по-здравословна алтернатива, изберете пица с повече зеленчуци."
      }
    }
  ]
}
```

## Fallback Behavior

If Groq is not configured:
- System falls back to Hugging Face models (if configured)
- If both are unavailable, basic receipt parsing is used
- Product analysis is skipped but transaction is still created

## Database Migration

Run the database schema update to create the new tables:
```sql
-- See database_schema.sql for the full schema
CREATE TABLE products (...);
CREATE TABLE receipt_products (...);
```

