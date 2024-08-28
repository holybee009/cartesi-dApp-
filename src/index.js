const { ethers } = require("ethers");
const { toUtf8String, hexlify, toUtf8Bytes } = ethers.utils;
const moment = require('moment');

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
  const utf8String = toUtf8String(hex);
  return JSON.parse(utf8String);
}

function obj2Hex(obj) {
  const jsonString = JSON.stringify(obj);
  return hexlify(toUtf8Bytes(jsonString));
}

function str2hex(str) {
  return hexlify(toUtf8Bytes(str));
}

function isNumeric(num) {
  return !isNaN(num);
}

function isEndOfMonth() {
  const today = moment();
  return today.isSame(today.endOf('month'), 'day');
}

function distributeSalary(employeeId) {
  if (!isEndOfMonth()) {
    return 'Salary distribution is only allowed at the end of the month';
  }

  const employee = employees.find(emp => emp.id === employeeId);

  if (!employee) {
    return 'Employee not found';
  }

  if (companyAccount.balance >= employee.salary) {
    companyAccount.balance -= employee.salary;
    return `Salary of ${employee.salary} distributed to ${employee.name}. New company balance: ${companyAccount.balance}`;
  } else {
    return 'Insufficient funds in company account';
  }
}

function addFunds(amount) {
  if (amount <= 0) {
    return 'Invalid amount';
  }
  companyAccount.balance += amount;
  return `Added ${amount} to company balance. New balance: ${companyAccount.balance}`;
}

async function payEmployees(input) {
  const [command, param] = input.payload.split(':');

  if (command === 'salary') {
    const employeeId = parseInt(param);

    if (isNaN(employeeId)) {
      await input.sendResponse('Invalid employee ID');
      return;
    }

    const result = distributeSalary(employeeId);
    await input.sendResponse(result);

  } else if (command === 'addFunds') {
    const amount = parseFloat(param);

    if (isNaN(amount)) {
      await input.sendResponse('Invalid amount');
      return;
    }

    const result = addFunds(amount);
    await input.sendResponse(result);

  } else {
    await input.sendResponse('Unknown command');
  }
};

let user = [];
let totalPaid = 0;

async function handle_advance(data) {
  console.log("Received advance request data " + JSON.stringify(data));

  const metadata = data['metadata'];
  const sender = metadata['msg_sender'];
  const payload = data['payload'];

  let employee_input = hex2Object(payload);
  
  if (isNumeric(employee_input)) {
    const report_req = await fetch(rollup_server + "/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload: obj2Hex("Object is not in hex format") }),
    });
    return 'reject';
  }

  user.push(sender);
  totalPaid += 1;

  const employee_output = await payEmployees(employee_input);

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
  const payload = data['payload'];

  const route = hex2str(payload);
  let responseObject = {};

  if (route === 'List') {
    responseObject = JSON.stringify({ user });
  } else if (route === 'total') {
    responseObject = JSON.stringify({ totalPaid });
  } else {
    responseObject = 'route not implemented';
  }

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
