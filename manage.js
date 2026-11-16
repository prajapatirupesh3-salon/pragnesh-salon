
const statusText = document.getElementById("manageStatus");
const details = document.getElementById("bookingDetails");
const actions = document.getElementById("manageActions");
const panel = document.getElementById("reschedulePanel");
const newDate = document.getElementById("newDate");
const newSlots = document.getElementById("newSlots");
const saveButton = document.getElementById("saveNewTime");

const params = new URLSearchParams(
  window.location.hash.slice(1)
);
const token = params.get("token");

let booking = null;
let selectedStart = null;
let requestId = 0;
let busy = false;

function salonDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function plusDays(dateString, days) {
  const d = new Date(dateString + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

function showError(message) {
  statusText.textContent = message;
}

async function loadBooking() {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    showError("Invalid booking link.");
    return;
  }

  const { data, error } = await salonDB.rpc(
    "get_managed_booking",
    { p_token: token }
  );

  if (error || !data || data.length === 0) {
    details.classList.add("hidden");
    showError(
      "Booking not found, cancelled or no longer eligible " +
      "for online changes."
    );
    return;
  }

  booking = data[0];

  const duration = booking.end_minute -
    booking.start_minute;

  document.getElementById("serviceName").textContent =
    booking.service;

  document.getElementById("appointmentDate").textContent =
    "Date: " + booking.booking_date;

  document.getElementById("appointmentTime").textContent =
    `Time: ${formatTime(booking.start_minute)} – ` +
    `${formatTime(booking.end_minute)} ` +
    `(${duration} minutes)`;

  details.classList.remove("hidden");
  actions.classList.remove("hidden");
  panel.classList.add("hidden");

  showError("Your appointment is confirmed.");
}

newDate.min = salonDate();
newDate.max = plusDays(salonDate(), 30);

async function loadAvailableTimes() {
  const currentRequest = ++requestId;
  selectedStart = null;
  saveButton.disabled = true;
  newSlots.textContent = "Checking availability...";

  const duration = booking.end_minute -
    booking.start_minute;

  const { data, error } = await salonDB.rpc(
    "get_available_slots",
    {
      p_date: newDate.value,
      p_duration: duration
    }
  );

  if (currentRequest !== requestId) return;

  if (error) {
    newSlots.textContent =
      "Unable to load times. Please try again.";
    return;
  }

  newSlots.replaceChildren();

  if (!data || data.length === 0) {
    newSlots.textContent =
      "No available times on this date.";
    return;
  }

  data.forEach(slot => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-slot";
    button.textContent = formatTime(slot.slot_minute);

    button.onclick = () => {
      document.querySelectorAll("#newSlots .time-slot")
        .forEach(el => el.classList.remove("selected"));

      button.classList.add("selected");
      selectedStart = slot.slot_minute;
      saveButton.disabled = false;
    };

    newSlots.appendChild(button);
  });
}

document.getElementById("rescheduleBtn").onclick =
  async () => {
    if (busy) return;

    actions.classList.add("hidden");
    panel.classList.remove("hidden");

    newDate.min = salonDate();
    newDate.max = plusDays(salonDate(), 30);
    newDate.value = booking.booking_date;

    await loadAvailableTimes();
  };

newDate.addEventListener("change", loadAvailableTimes);

document.getElementById("backBtn").onclick = () => {
  ++requestId;
  panel.classList.add("hidden");
  actions.classList.remove("hidden");
};

saveButton.onclick = async () => {
  if (busy || selectedStart === null) return;

  busy = true;
  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  const { data, error } = await salonDB.rpc(
    "reschedule_salon_booking",
    {
      p_token: token,
      p_date: newDate.value,
      p_start: selectedStart
    }
  );

  busy = false;
  saveButton.textContent = "Confirm New Time";

  if (error || data !== true) {
    showError(
      "Unable to reschedule. The time may no longer " +
      "be available. Please choose another slot."
    );
    await loadAvailableTimes();
    return;
  }

  await loadBooking();
  showError("Your appointment was rescheduled successfully!");
};

document.getElementById("cancelBtn").onclick =
  async () => {
    if (busy) return;

    const confirmed = window.confirm(
      "Are you sure you want to cancel your appointment?"
    );

    if (!confirmed) return;

    busy = true;
    const cancelButton =
      document.getElementById("cancelBtn");

    cancelButton.disabled = true;

    const { data, error } = await salonDB.rpc(
      "cancel_salon_booking",
      { p_token: token }
    );

    busy = false;
    cancelButton.disabled = false;

    if (error || data !== true) {
      showError(
        "Unable to cancel this appointment. " +
        "Please contact the salon."
      );
      return;
    }

    booking = null;
    ++requestId;

    details.classList.add("hidden");
    panel.classList.add("hidden");

    // The cancelled booking token is no longer usable.
    history.replaceState(
      null, "",
      window.location.pathname
    );

    showError(
      "Your appointment has been cancelled successfully. " +
      "The time is now available for new bookings."
    );
  };

loadBooking();
