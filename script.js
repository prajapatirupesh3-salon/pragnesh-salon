
let selectedService = "Haircut";
let duration = 15;
let selectedTime = null;
let availableSlots = [];

const dateInput = document.getElementById("bookingDate");
const slotsContainer = document.getElementById("timeSlots");
const nextButton = document.getElementById("timeNext");

function salonToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

function changeStep(step) {
  document.querySelectorAll(".step").forEach(el =>
    el.classList.add("hidden")
  );
  document.getElementById(`step${step}`).classList
    .remove("hidden");

  for (let i = 1; i <= 3; i++) {
    document.getElementById(`stepLabel${i}`)
      .classList.toggle("active", i === step);
  }
}

dateInput.min = salonToday();
dateInput.max = addDays(salonToday(), 30);
dateInput.value = salonToday();

document.querySelectorAll(".service").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".service").forEach(b =>
      b.classList.remove("selected")
    );

    button.classList.add("selected");
    selectedService = button.dataset.service;
    duration = Number(button.dataset.duration);
    selectedTime = null;
  });
});

let requestNumber = 0;

async function generateSlots() {
  const currentRequest = ++requestNumber;
  selectedTime = null;
  nextButton.disabled = true;
  slotsContainer.textContent = "Checking available times...";

  const date = dateInput.value;
  if (!date) return;

  const { data, error } = await salonDB.rpc(
    "get_available_slots",
    {
      p_date: date,
      p_duration: duration
    }
  );

  if (currentRequest !== requestNumber) return;

  if (error) {
    console.error("Availability error:", error);
    slotsContainer.textContent =
      "Unable to load appointments. Please try again.";
    return;
  }

  availableSlots = (data || []).map(x => x.slot_minute);
  slotsContainer.innerHTML = "";

  if (availableSlots.length === 0) {
    slotsContainer.textContent =
      "No available appointments for this date.";
    return;
  }

  availableSlots.forEach(start => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-slot";
    button.textContent = formatTime(start);

    button.onclick = () => {
      document.querySelectorAll(".time-slot").forEach(b =>
        b.classList.remove("selected")
      );

      button.classList.add("selected");
      selectedTime = start;
      nextButton.disabled = false;
    };

    slotsContainer.appendChild(button);
  });
}

document.getElementById("serviceNext").onclick = async () => {
  document.getElementById("selectedService").textContent =
    `${selectedService} · ${duration} minutes`;

  changeStep(2);
  await generateSlots();
};

dateInput.addEventListener("change", generateSlots);

document.getElementById("back1").onclick = () =>
  changeStep(1);

nextButton.onclick = () => {
  if (selectedTime === null) return;

  document.getElementById("bookingSummary").textContent =
    `${selectedService} | ${dateInput.value} | ` +
    `${formatTime(selectedTime)} – ` +
    `${formatTime(selectedTime + duration)}`;

  changeStep(3);
};

document.getElementById("back2").onclick = async () => {
  changeStep(2);
  await generateSlots();
};

const bookingForm = document.getElementById("bookingForm");

bookingForm.addEventListener("submit", async event => {
  event.preventDefault();

  const submitButton = bookingForm.querySelector(
    'button[type="submit"]'
  );

  if (selectedTime === null) return;

  submitButton.disabled = true;
  submitButton.textContent = "Confirming...";

  const bookingDate = dateInput.value;
  const appointmentTime = selectedTime;

  const name = document.getElementById("customerName")
    .value.trim();
  const mobile = document.getElementById("mobile")
    .value.trim();
  const email = document.getElementById("email")
    .value.trim();


  const { data, error } = await salonDB.rpc(
    "create_salon_booking_v2",
    {
      p_date: bookingDate,
      p_start: appointmentTime,
      p_service: selectedService,
      p_name: name,
      p_mobile: mobile,
      p_email: email || null
    }
  );

  submitButton.disabled = false;
  submitButton.textContent = "Confirm Booking";

  if (error) {
    console.error("Booking error:", error);
    alert(
      "Unable to complete booking. This slot may " +
      "have been taken. Please choose another time."
    );
    changeStep(2);
    await generateSlots();
    return;
  }

  const manageUrl = new URL("manage.html", location.href);
  manageUrl.hash = "token=" + data.manage_token;

  document.querySelectorAll(".step").forEach(el =>
    el.classList.add("hidden")
  );

  const success = document.getElementById("success");
  success.classList.remove("hidden");

  success.querySelector("h3").textContent =
    "Booking Confirmed!";

  document.getElementById("successMessage").textContent =
    `Thanks ${name}! Your ${selectedService} is booked ` +
    `for ${bookingDate} at ${formatTime(appointmentTime)}.`;

  success.querySelector(".muted").textContent =
    "Save your private management link below. " +
    "It lets you reschedule or cancel. " +
    "SMS and email delivery will be added later.";

  document.getElementById("manageLinkBox")?.remove();

  const linkBox = document.createElement("div");
  linkBox.id = "manageLinkBox";
  linkBox.className = "manage-link-box";

  const link = document.createElement("a");
  link.href = manageUrl.href;
  link.textContent = "Manage My Booking";
  link.className = "primary manage-link";

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "secondary";
  copyButton.textContent = "Copy Private Link";

  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(manageUrl.href);
      copyButton.textContent = "Link Copied!";
    } catch {
      window.prompt(
        "Copy and save your private booking link:",
        manageUrl.href
      );
    }
  };

  linkBox.append(link, copyButton);
  success.appendChild(linkBox);
});


document.getElementById("startAgain").onclick = () => {
  bookingForm.reset();
  dateInput.value = salonToday();
  selectedTime = null;
  changeStep(1);
};
