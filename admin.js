
const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");
const logoutBtn = document.getElementById("logoutBtn");
const adminDate = document.getElementById("adminDate");

let schedule = [];


function formatMinute(min) {
  const hour = Math.floor(min / 60);
  const minute = String(min % 60).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";

  return `${hour % 12 || 12}:${minute} ${suffix}`;
}


function todayInAdelaide() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = type => parts.find(p => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

adminDate.value = todayInAdelaide();


function showLogin() {
  loginSection.classList.remove("hidden");
  dashboardSection.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  schedule = [];
}

function showDashboard() {
  loginSection.classList.add("hidden");
  dashboardSection.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
}

async function verifyAdmin() {
  const { data, error } = await salonDB.rpc(
    "salon_is_admin"
  );

  if (error || data !== true) {
    showLogin();
    return false;
  }

  showDashboard();
  await loadSchedule();
  return true;
}

async function initialise() {
  const { data } = await salonDB.auth.getUser();

  if (data.user) {
    await verifyAdmin();
  } else {
    showLogin();
  }
}

document.getElementById("loginForm")
  .addEventListener("submit", async event => {
    event.preventDefault();

    const message = document.getElementById("loginMessage");
    message.textContent = "Signing in...";

    const email = document.getElementById("adminEmail").value;
    const password =
      document.getElementById("adminPassword").value;

    const { error } = await salonDB.auth.signInWithPassword({
      email,
      password
    });

    document.getElementById("adminPassword").value = "";

    if (error) {
      message.textContent = "Login failed: " + error.message;
      return;
    }

    const allowed = await verifyAdmin();

    if (!allowed) {
      await salonDB.auth.signOut();
      message.textContent = "This account is not an administrator.";
    } else {
      message.textContent = "";
    }
  });

logoutBtn.addEventListener("click", async () => {
  await salonDB.auth.signOut();
  showLogin();
});

function makeTextElement(tag, text, className = "") {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function createEntry(entry) {
  const card = document.createElement("div");
  card.className = "appointment-card";

  const info = document.createElement("div");

  info.appendChild(makeTextElement(
    "strong",
    entry.entry_type === "blocked"
      ? entry.service || "Blocked time"
      : entry.customer_name
  ));

  const time = `${formatMinute(entry.start_minute)} – ` +
    `${formatMinute(entry.end_minute)}`;

  info.appendChild(makeTextElement(
    "p", time, "muted"
  ));

  if (entry.entry_type !== "blocked") {
    info.appendChild(makeTextElement(
      "p", entry.service, "service-tag"
    ));

    info.appendChild(makeTextElement(
      "p", entry.mobile, "muted"
    ));

    if (entry.email) {
      info.appendChild(makeTextElement(
        "p", entry.email, "muted"
      ));
    }
  }

  card.appendChild(info);
  return card;
}

async function loadSchedule() {
  const message = document.getElementById("scheduleMessage");
  const date = adminDate.value;

  message.textContent = "Loading appointments...";

  const { data, error } = await salonDB.rpc(
    "admin_day_schedule",
    { p_date: date }
  );

  if (adminDate.value !== date) return;

  if (error) {
    console.error(error);
    message.textContent = "Unable to load appointments.";
    return;
  }

  schedule = data || [];

  const bookings = schedule.filter(
    x => x.entry_type === "booking"
  );

  const blocks = schedule.filter(
    x => x.entry_type === "blocked"
  );

  document.getElementById("totalBookings")
    .textContent = bookings.length;

  document.getElementById("hairBookings")
    .textContent = bookings.filter(x =>
      x.service === "Haircut" ||
      x.service === "Haircut + Beard"
    ).length;

  document.getElementById("blockedCount")
    .textContent = blocks.length;

  const appointmentList =
    document.getElementById("appointmentList");

  appointmentList.replaceChildren();

  bookings.forEach(booking => {
    appointmentList.appendChild(createEntry(booking));
  });

  message.textContent = bookings.length
    ? ""
    : "No appointments for this date.";

  renderBlocks(blocks);
}

function renderBlocks(blocks) {
  const container = document.getElementById("blockedList");
  container.replaceChildren();

  if (blocks.length === 0) {
    container.appendChild(makeTextElement(
      "p", "No blocked times for this date.", "muted"
    ));
    return;
  }

  blocks.forEach(block => {
    const card = createEntry(block);

    const button = makeTextElement(
      "button", "Remove Block"
    );
    button.className = "secondary";

    button.addEventListener("click", async () => {
      const confirmed = confirm(
        "Remove this blocked time and make it available?"
      );

      if (!confirmed) return;

      button.disabled = true;

      const { data, error } = await salonDB.rpc(
        "admin_unblock_time",
        { p_id: block.id }
      );

      if (error || data !== true) {
        alert("Unable to remove this blocked time.");
        button.disabled = false;
        return;
      }

      await loadSchedule();
    });

    card.appendChild(button);
    container.appendChild(card);
  });
}

// Populate time dropdowns in 15-minute increments.
const startSelect = document.getElementById("blockStart");
const endSelect = document.getElementById("blockEnd");

function populateTimeOptions(select, selected) {
  for (let minute = 600; minute <= 1020; minute += 15) {
    const option = document.createElement("option");
    option.value = minute;
    option.textContent = formatMinute(minute);
    select.appendChild(option);
  }
  select.value = String(selected);
}

populateTimeOptions(startSelect, 780); // 1:00 PM
populateTimeOptions(endSelect, 810);   // 1:30 PM

document.getElementById("blockForm")
  .addEventListener("submit", async event => {
    event.preventDefault();

    const start = Number(startSelect.value);
    const end = Number(endSelect.value);
    const message = document.getElementById("blockMessage");

    if (end <= start) {
      message.textContent =
        "End time must be later than start time.";
      return;
    }

    message.textContent = "Saving blocked time...";

    const { error } = await salonDB.rpc(
      "admin_block_time",
      {
        p_date: adminDate.value,
        p_start: start,
        p_end: end,
        p_reason:
          document.getElementById("blockReason").value
      }
    );

    if (error) {
      console.error(error);
      message.textContent =
        "Cannot block this period. It may overlap an " +
        "existing appointment or another blocked time.";
      return;
    }

    message.textContent = "Time blocked successfully!";
    await loadSchedule();
  });

adminDate.addEventListener("change", loadSchedule);

document.getElementById("refreshBtn")
  .addEventListener("click", loadSchedule);

initialise();
