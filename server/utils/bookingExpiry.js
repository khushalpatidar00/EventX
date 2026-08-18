const Booking = require('../models/Booking');
const Event = require('../models/Event');
const { redisClient } = require('../config/redis');

const startBookingExpiryMonitor = (io) => {
    setInterval(async () => {
        try {
            const now = new Date();

            const expiredBookings = await Booking.find({
                status: 'pending',
                lockExpiresAt: { $lte: now }
            });

            for (const booking of expiredBookings) {
                // Atomically change only still-pending bookings
                const expiredBooking = await Booking.findOneAndUpdate(
                    {
                        _id: booking._id,
                        status: 'pending',
                        lockExpiresAt: { $lte: now }
                    },
                    {
                        status: 'expired'
                    },
                    {
                        new: true
                    }
                );

                // Another process/request may have already handled it
                if (!expiredBooking) {
                    continue;
                }

                const event = await Event.findByIdAndUpdate(
                    expiredBooking.eventId,
                    { $inc: { availableSeats: 1 } },
                    { new: true }
                );

                const lockKey = `event:${expiredBooking.eventId}:user:${expiredBooking.userId}`;

                await redisClient.del(lockKey);

                if (event) {
                    io.emit('eventSeatsUpdated', {
                        eventId: event._id.toString(),
                        availableSeats: event.availableSeats
                    });
                }

                console.log(
                    `Booking ${expiredBooking._id} expired. Seat released.`
                );
            }
        } catch (error) {
            console.error('Booking expiry monitor error:', error);
        }
    }, 10000);
};

module.exports = startBookingExpiryMonitor;