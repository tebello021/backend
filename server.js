const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// ID generator
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

// Database file
const dbPath = path.join(__dirname, 'data', 'database.json');

// Ensure data folder exists
if (!fs.existsSync(path.dirname(dbPath))) fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Initialize database if missing
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ products: [], sales: [], customers: [], stockTransactions: [] }, null, 2));
}

// Helpers
const readDatabase = () => {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return { products: [], sales: [], customers: [], stockTransactions: [] };
  }
};

const writeDatabase = (data) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('DB write error:', err);
    return false;
  }
};

// Routes
app.get('/api/products', (req, res) => {
  const db = readDatabase();
  res.json(db.products);
});

app.post('/api/products', (req, res) => {
  const db = readDatabase();
  const product = {
    id: generateId(),
    name: req.body.name,
    category: req.body.category,
    price: Number(req.body.price),
    quantity: Number(req.body.quantity),
    lowStockThreshold: Number(req.body.lowStockThreshold) || 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.products.push(product);
  writeDatabase(db);
  res.status(201).json(product);
});

// Record sale endpoint
app.post('/api/sales', (req, res) => {
  try {
    const db = readDatabase();
    const { items, customerName, totalAmount, paymentMethod } = req.body;

    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Items array required' });
    if (!totalAmount || Number(totalAmount) <= 0) return res.status(400).json({ error: 'Valid totalAmount required' });

    const sale = {
      id: generateId(),
      customerName: customerName || 'Walk-in Customer',
      items: items.map(i => ({
        productId: i.productId,
        name: i.name,
        price: Number(i.price),
        quantity: Number(i.quantity)
      })),
      totalAmount: Number(totalAmount),
      paymentMethod: paymentMethod || 'cash',
      date: new Date().toISOString()
    };

    const updatedProducts = [];

    for (let item of sale.items) {
      const product = db.products.find(p => p.id === item.productId);
      if (!product) return res.status(400).json({ error: `Product with ID ${item.productId} not found` });
      if (product.quantity < item.quantity)
        return res.status(400).json({ error: `Insufficient stock for ${product.name}. Available: ${product.quantity}, Requested: ${item.quantity}` });

      product.quantity -= item.quantity;
      product.updatedAt = new Date().toISOString();
      updatedProducts.push(product);

      db.stockTransactions.push({
        id: generateId(),
        productId: product.id,
        type: 'out',
        quantity: item.quantity,
        reason: `Sale #${sale.id}`,
        date: new Date().toISOString()
      });
    }

    db.sales.push(sale);
    writeDatabase(db);

    res.status(201).json({ message: 'Sale recorded', sale });
  } catch (err) {
    console.error('Error recording sale:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Get sales
app.get('/api/sales', (req, res) => {
  const db = readDatabase();
  res.json(db.sales);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
