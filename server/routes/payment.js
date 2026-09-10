const express = require('express');

const router = express.Router();

const { createOrder } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.post('/create-order', protect, createOrder);

module.exports = router;