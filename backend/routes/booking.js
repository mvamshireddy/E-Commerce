const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const bookingController = require('../controllers/bookingController');

// POST /api/bookings (controller version)
router.post('/', auth, bookingController.createBooking);

// GET /api/bookings/:referenceId
router.get('/:referenceId', bookingController.getBookingByReferenceId);

// Helper: Check for overlapping bookings (car unavailable)
async function isCarAvailable(carId, startTime, endTime) {
  const overlap = await Booking.findOne({
    car: carId,
    status: { $in: ['active', 'confirmed'] },
    $or: [
      { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
    ]
  });
  return !overlap;
}

// DIRECT POST /api/bookings (auth required) -- preserves contactDetails!
router.post('/direct', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    let {
      car, carType, carDetails, startTime, endTime,
      pickupLocation, dropoffLocation, referenceId, status, paymentIntentId, contactDetails
    } = req.body;

    // Validation: required fields
    if (!car && !carDetails)
      return res.status(400).json({ message: "Car ID or carDetails info required." });
    if (!startTime || !endTime)
      return res.status(400).json({ message: "Start and end times required." });
    if (!pickupLocation || !dropoffLocation)
      return res.status(400).json({ message: "Pickup and dropoff locations required." });

    // Validation: date logic
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start) || isNaN(end))
      return res.status(400).json({ message: "Invalid dates provided." });
    if (start < new Date())
      return res.status(400).json({ message: "Start time cannot be in the past." });
    if (end <= start)
      return res.status(400).json({ message: "End time must be after start time." });

    // Car availability (only for DB cars)
    if (carType === "backend" && car) {
      const available = await isCarAvailable(car, start, end);
      if (!available) return res.status(409).json({ message: "Car is not available for the selected dates." });
    }

    // Generate reference ID if not provided
    if (!referenceId) referenceId = uuidv4();

    const booking = new Booking({
      user: userId,
      car: carType === "backend" ? car : undefined,
      staticCar: carType === "static" ? carDetails : undefined,
      startTime: start,
      endTime: end,
      pickupLocation,
      dropoffLocation,
      referenceId,
      status: status || 'active',
      paymentIntentId,
      contactDetails // <-- Store contact details!
    });

    await booking.save();
    res.status(201).json({ message: 'Booking created', booking });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

module.exports = router;