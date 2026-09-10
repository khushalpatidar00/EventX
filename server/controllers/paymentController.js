const razorpay = require('../config/razorpay');

exports.createOrder = async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                message: 'Valid amount is required'
            });
        }

        const options = {
            amount: Math.round(amount * 100),
            currency: 'INR',
            receipt: `eventx_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        res.status(201).json({
            message: 'Razorpay order created',
            order
        });

    } catch (error) {
        console.error('Create Razorpay Order Error:', error);

        res.status(500).json({
            message: 'Unable to create payment order'
        });
    }
};