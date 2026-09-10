const razorpay = require('../config/razorpay');
const Booking = require('../models/Booking');

exports.createOrder = async (req, res) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                message: 'Booking ID is required'
            });
        }

        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({
                message: 'Booking not found'
            });
        }

        // Only the booking owner can pay
        if (booking.userId.toString() !== req.user.id) {
            return res.status(403).json({
                message: 'Not authorized'
            });
        }

        // Payment is allowed only for pending bookings
        if (booking.status !== 'pending') {
            return res.status(400).json({
                message: 'Booking is not available for payment'
            });
        }

        // Don't allow payment after seat lock expires
        if (
            booking.lockExpiresAt &&
            booking.lockExpiresAt <= new Date()
        ) {
            return res.status(400).json({
                message: 'Seat reservation has expired'
            });
        }

        const options = {
            amount: Math.round(booking.amount * 100),
            currency: 'INR',
            receipt: `booking_${booking._id}`
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