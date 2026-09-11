const Booking = require('../models/Booking');
const Event = require('../models/Event');
const OTP = require('../models/OTP');
const { sendBookingEmail, sendOTPEmail } = require('../utils/email');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const { redisClient } = require('../config/redis');

exports.sendBookingOTP = async (req, res) => {
    try {
        const otp = generateOTP();
        await OTP.findOneAndDelete({ email: req.user.email, action: 'event_booking' });
        await OTP.create({ email: req.user.email, otp, action: 'event_booking' });
        await sendOTPEmail(req.user.email, otp, 'event_booking');
        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error sending OTP', error: error.message });
    }
};

exports.bookEvent = async (req, res) => {
    let lockKey = null;
    let seatReserved = false;

    try {
        const { eventId, otp } = req.body;

        // Verify OTP
        const validOTP = await OTP.findOne({
            email: req.user.email,
            otp,
            action: 'event_booking'
        });

        if (!validOTP) {
            return res.status(400).json({
                message: 'Invalid or expired OTP for booking'
            });
        }

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({
                message: 'Event not found'
            });
        }

        // Prevent duplicate booking
        const existingBooking = await Booking.findOne({
            userId: req.user.id,
            eventId
        });

        if (existingBooking && !['cancelled', 'expired'].includes(existingBooking.status)) {
            return res.status(400).json({
                message: 'Already booked or pending'
            });
        }

        // Redis temporary lock for this user's booking
        lockKey = `event:${eventId}:user:${req.user.id}`;

        const lockAcquired = await redisClient.set(
            lockKey,
            'locked',
            {
                NX: true,
                EX: 300
            }
        );

        if (!lockAcquired) {
            return res.status(409).json({
                message: 'You already have a temporary reservation for this event'
            });
        }

        // Atomically reserve one seat
        const updatedEvent = await Event.findOneAndUpdate(
            {
                _id: eventId,
                availableSeats: { $gt: 0 }
            },
            {
                $inc: { availableSeats: -1 }
            },
            {
                new: true
            }
        );

        if (!updatedEvent) {
            await redisClient.del(lockKey);
            lockKey = null;

            return res.status(400).json({
                message: 'No seats available'
            });
        }

        seatReserved = true;

        // Create pending booking
        const lockExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

        const booking = await Booking.create({
            userId: req.user.id,
            eventId,
            status: 'pending',
            paymentStatus: 'not_paid',
            amount: event.ticketPrice,
            lockExpiresAt
        });
        // Free event: confirm booking immediately
if (event.ticketPrice === 0) {
    booking.status = 'confirmed';
    booking.paymentStatus = 'not_paid';
    booking.amount = 0;
    booking.lockExpiresAt = null;

    await booking.save();

    // Release Redis lock
    await redisClient.del(lockKey);

    // OTP cleanup
    await OTP.deleteOne({ _id: validOTP._id });

    // Realtime availability update
    const io = req.app.get('io');

    io.emit('eventSeatsUpdated', {
        eventId: eventId.toString(),
        availableSeats: updatedEvent.availableSeats
    });

    // Populate booking for email
    const populatedBooking = await Booking.findById(booking._id)
        .populate('userId', 'name email')
        .populate('eventId', 'title date location');

    // Send confirmation email
    sendBookingEmail(
        populatedBooking.userId.email,
        populatedBooking.userId.name,
        populatedBooking.eventId.title
    ).catch((error) => {
        console.error('Free booking email error:', error);
    });

    return res.status(201).json({
        message: 'Free event booked successfully.',
        booking: populatedBooking
    });
}
        // OTP cleanup
        await OTP.deleteOne({ _id: validOTP._id });

        // Realtime availability update
        const io = req.app.get('io');

        io.emit('eventSeatsUpdated', {
            eventId: eventId.toString(),
            availableSeats: updatedEvent.availableSeats
        });

        res.status(201).json({
            message: 'Seat reserved temporarily. Booking is pending confirmation.',
            booking
        });

    } catch (error) {
        // Roll back Redis lock if something failed
        if (lockKey) {
            await redisClient.del(lockKey).catch(() => {});
        }

        // Roll back reserved seat if it was already deducted
        if (seatReserved) {
            await Event.findByIdAndUpdate(
                req.body.eventId,
                { $inc: { availableSeats: 1 } }
            ).catch(() => {});
        }

        console.error('Booking Error:', error);

        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.confirmBooking = async (req, res) => {
    try {
        const { paymentStatus } = req.body; // 'paid' or 'not_paid'
        const booking = await Booking.findById(req.params.id).populate('userId').populate('eventId');
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (booking.status === 'expired') {
    return res.status(400).json({
        message: 'This booking has expired'
    });
}

if (booking.lockExpiresAt && booking.lockExpiresAt <= new Date()) {
    return res.status(400).json({
        message: 'Seat reservation has expired'
    });
}

        if (booking.status === 'confirmed') return res.status(400).json({ message: 'Booking is already confirmed' });

       

        booking.status = 'confirmed';
        if (paymentStatus) {
            booking.paymentStatus = paymentStatus;
        }
        await booking.save();

       // Release the temporary Redis lock after confirmation
const lockKey = `event:${booking.eventId._id}:user:${booking.userId._id}`;
await redisClient.del(lockKey);
        const io = req.app.get('io');

io.emit('eventSeatsUpdated', {
    eventId: event._id.toString(),
    availableSeats: event.availableSeats
});
        // Send email on admin confirmation
        await sendBookingEmail(booking.userId.email, booking.userId.name, booking.eventId.title);

        res.json({ message: 'Booking confirmed successfully', booking });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getMyBookings = async (req, res) => {
    try {
        const bookings = req.user.role === 'admin'
            ? await Booking.find().populate('eventId').populate('userId', 'name email').sort({ createdAt: -1 })
            : await Booking.find({ userId: req.user.id }).populate('eventId').sort({ createdAt: -1 });
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.cancelBooking = async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                message: 'Booking not found'
            });
        }

        if (
            booking.userId.toString() !== req.user.id &&
            req.user.role !== 'admin'
        ) {
            return res.status(403).json({
                message: 'Not authorized'
            });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({
                message: 'Already cancelled'
            });
        }

        if (booking.status === 'expired') {
            return res.status(400).json({
                message: 'Booking has already expired'
            });
        }

        const wasReserved =
            booking.status === 'pending' ||
            booking.status === 'confirmed';

        // Cancel booking
        booking.status = 'cancelled';
        await booking.save();

        // Remove Redis lock
        const lockKey = `event:${booking.eventId}:user:${booking.userId}`;
        await redisClient.del(lockKey);

        // Release seat if this booking had reserved one
        if (wasReserved) {
            const event = await Event.findByIdAndUpdate(
                booking.eventId,
                { $inc: { availableSeats: 1 } },
                { new: true }
            );

            // Notify connected clients
            if (event) {
                const io = req.app.get('io');

                io.emit('eventSeatsUpdated', {
                    eventId: event._id.toString(),
                    availableSeats: event.availableSeats
                });
            }
        }

        res.json({
            message: 'Booking cancelled successfully'
        });

    } catch (error) {
        console.error('Cancel Booking Error:', error);

        res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
};