// XXX even though ethers is not used in the code below, it's very likely
// it will be used by any DApp, so we are already including it here
const { ethers } = require("ethers");
const moment = require('moment'); // Import moment.js for date handling

const rollup_server = process.env.ROLLUP_HTTP_SERVER_URL;
console.log("HTTP rollup_server url is " + rollup_server);

// In-memory company account
let companyAccount = {
  balance: 50000 // Company balance in some currency unit
};

// In-memory list of employees
let employees = [
  { id: 1, name: 'John Doe', salary: 5000 },
  { id: 2, name: 'Jane Smith', salary: 6000 },
  { id: 3, name: 'Alice Johnson', salary: 7000 }
];

function hex2Object(hex) {
  const utf8String = ethers.toUtf8String(hex);

  return JSON.parse(utf8String);
}

function obj2Hex(obj) {
  const jsonString = JSON.stringify(obj);

  const hexString = ethers.hexlify(ethers.toUtf8Bytes(jsonString));

  return hexString;
}

function isNumeric(num) {
  return !isNaN(num)
}


// Function to check if today is the end of the month
function isEndOfMonth() {
  const today = moment();
  return today.isSame(today.endOf('month'), 'day');
}

// Function to distribute salary and deduct it from the company account
function distributeSalary(employeeId) {
  // Check if today is the end of the month
  if (!isEndOfMonth()) {
      return 'Salary distribution is only allowed at the end of the month';
  }

  // Find the employee by ID
  const employee = employees.find(emp => emp.id === employeeId);

  // Check if the employee exists
  if (!employee) {
      return 'Employee not found';
  }

  // Check if the company has sufficient funds
  if (companyAccount.balance >= employee.salary) {
      companyAccount.balance -= employee.salary; // Deduct salary from company balance
      return `Salary of ${employee.salary} distributed to ${employee.name}. New company balance: ${companyAccount.balance}`;
  } else {
      return 'Insufficient funds in company account';
  }
}

// Function to increase the company's balance
function addFunds(amount) {
  // Validate the amount to ensure it's positive
  if (amount <= 0) {
      return 'Invalid amount';
  }
  companyAccount.balance += amount; // Add funds to company balance
  return `Added ${amount} to company balance. New balance: ${companyAccount.balance}`;
}

// Rollup input handler
async function payEmployees (input) {
  // Split the input payload into command and parameter
  const [command, param] = input.payload.split(':');

  if (command === 'salary') {
      // Handle salary distribution command
      const employeeId = parseInt(param); // Convert parameter to integer

      // Check if employee ID is valid
      if (isNaN(employeeId)) {
          await input.sendResponse('Invalid employee ID');
          return;
      }

      // Distribute salary and send response
      const result = distributeSalary(employeeId);
      await input.sendResponse(result);

  } else if (command === 'addFunds') {
      // Handle add funds command
      const amount = parseFloat(param); // Convert parameter to float

      // Check if amount is valid
      if (isNaN(amount)) {
          await input.sendResponse('Invalid amount');
          return;
      }

      // Add funds and send response
      const result = addFunds(amount);
      await input.sendResponse(result);

  } else {
      // Handle unknown commands
      await input.sendResponse('Unknown command');
  }
};

let user = []
let totalPaid = 0

async function handle_advance(data) {
  console.log("Received advance request data " + JSON.stringify(data));

  const metadata = data['metadata']
  const sender = metadata['msg_sender']
  const payload = data['payload ']

  let employee_input = hex2Object(payload)
  if (isNumeric(sentence)){
    //add error input
    const report_req = await fetch(rollup_server + "/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({  payload: obj2Hex("Object is not in hex format") }),
    });
    return 'reject'
  }
  user.push(sender)
  totalPaid += 1
  
  const employee_output = payEmployees(employee_input)
  
  const notice_req = await fetch(rollup_server + "/notice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: obj2Hex(employee_output) }),
  });
  return "accept";
}

async function handle_inspect(data) {
  console.log("Received inspect request data " + JSON.stringify(data));
  const payload = data['payload']

  const route = hex2str(payload)
  let responseObject = {}
  if (route === 'List') {
    responseObject = JSON.stringify({user})
  } else if (route === 'total') {
responseObject = JSON.stringify({totalPaid})
  } else { responseObject = 'route not implemented'}

  const report_req = await fetch(rollup_server + "/report", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload: str2hex(responseObject) }),
  });
  return "accept";
}

var handlers = {
  advance_state: handle_advance,
  inspect_state: handle_inspect,
};

var finish = { status: "accept" };

(async () => {
  while (true) {
    const finish_req = await fetch(rollup_server + "/finish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "accept" }),
    });

    console.log("Received finish status " + finish_req.status);

    if (finish_req.status == 202) {
      console.log("No pending rollup request, trying again");
    } else {
      const rollup_req = await finish_req.json();
      var handler = handlers[rollup_req["request_type"]];
      finish["status"] = await handler(rollup_req["data"]);
    }
  }
})();
