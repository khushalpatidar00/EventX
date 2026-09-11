const { redisClient } = require('../config/redis');
const { sendBookingEmail } = require('../utils/email');
const razorpay = require('../config/razorpay');
const Booking = require('../models/Booking');
const crypto = require('crypto');

exports.verifyPayment = async (req, res) => {
    try {
        const {
            bookingId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        if (
            !bookingId ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                message: 'Payment details are required'
            });
        }

        const booking = await Booking.findById(bookingId);

        if (!booking) {
            return res.status(404).json({
                message: 'Booking not found'
            });
        }

        if (booking.userId.toString() !== req.user.id) {
            return res.status(403).json({
                message: 'Not authorized'
            });
        }

        // Idempotency: payment already verified
        if (
            booking.paymentStatus === 'paid' &&
            booking.status === 'confirmed'
        ) {
            return res.status(200).json({
                message: 'Payment already verified',
                booking
            });
        }

        if (booking.status !== 'pending') {
            return res.status(400).json({
                message: 'Booking is not available for payment'
            });
        }

        if (
            booking.lockExpiresAt &&
            booking.lockExpiresAt <= new Date()
        ) {
            return res.status(400).json({
                message: 'Seat reservation has expired'
            });
        }

        // Verify order belongs to this booking
        if (booking.razorpayOrderId !== razorpay_order_id) {
            return res.status(400).json({
                message: 'Invalid Razorpay order'
            });
        }

        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${booking.razorpayOrderId}|${razorpay_payment_id}`)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({
                message: 'Invalid payment signature'
            });
        }

       booking.paymentStatus = 'paid';
booking.status = 'confirmed';
booking.razorpayPaymentId = razorpay_payment_id;

await booking.save();

// Release Redis lock after successful payment
const lockKey = `event:${booking.eventId}:user:${booking.userId}`;
await redisClient.del(lockKey).catch((err) => {
    console.error('Redis lock release error:', err);
});

// Get booking details for email
const populatedBooking = await Booking.findById(booking._id)
    .populate('userId')
    .populate('eventId');

if (populatedBooking) {
    // Realtime update
    const io = req.app.get('io');

    const event = populatedBooking.eventId;

    io.emit('eventSeatsUpdated', {
        eventId: event._id.toString(),
        availableSeats: event.availableSeats
    });

    // Confirmation email
    await sendBookingEmail(
        populatedBooking.userId.email,
        populatedBooking.userId.name,
        event.title
    ).catch((err) => {
        console.error('Booking confirmation email error:', err);
    });
}

res.status(200).json({
    message: 'Payment verified successfully',
    booking: populatedBooking || booking
});
    } catch (error) {
        console.error('Verify Razorpay Payment Error:', error);

        res.status(500).json({
            message: 'Unable to verify payment'
        });
    }
};

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

        booking.razorpayOrderId = order.id;
        await booking.save();

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