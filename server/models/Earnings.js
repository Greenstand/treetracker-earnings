const { HttpRequest } = require('aws-sdk');
const knex = require('../database/knex');
const HttpError = require('../utils/HttpError');

const Earning = ({
  worker_id,
  funder_id,
  amount,
  currency,
  calculated_at,
  consolidation_period_start,
  consolidation_period_end,
  payment_confirmation_id,
  payment_system,
  payment_confirmed_by,
  payment_confirmation_method,
  payment_confirmed_at,
  paid_at,
  status,
  batch_id,
}) => {
  // make a call to the contract microservice and get the consolidation_rule
  const consolidation_rule = 'mock value';
  return Object.freeze({
    worker_id,
    funder_id,
    amount,
    currency,
    calculated_at,
    consolidation_rule,
    consolidation_period_start,
    consolidation_period_end,
    payment_confirmation_id,
    payment_system,
    payment_confirmed_by,
    payment_confirmation_method,
    paid_at,
    payment_confirmed_at,
    status,
    batch_id,
  });
};

const BatchEarning = ({ id, worker_id, amount, currency, status }) => {
  // Get the phone value from a call to an external api entity || stakeholder API
  return Object.freeze({
    earnings_id: id,
    worker_id,
    phone: 'Not sure for now',
    currency,
    amount,
    status,
  });
};

const FilterCriteria = ({
  earnings_status = undefined,
  funder_id = undefined,
  worker_id = undefined,
  contract_id = undefined,
  start_date = undefined,
  end_date = undefined,
}) => {
  return Object.entries({
    status: earnings_status,
    worker_id,
    funder_id,
    contract_id,
    calculated_at_end: end_date ? new Date(end_date) : end_date,
    calculated_at_start: start_date ? new Date(start_date) : start_date,
  })
    .filter((entry) => entry[1] !== undefined)
    .reduce((result, item) => {
      result[item[0]] = item[1];
      return result;
    }, {});
};

const QueryOptions = ({ limit = undefined, offset = undefined }) => {
  return Object.entries({ limit, offset })
    .filter((entry) => entry[1] !== undefined)
    .reduce((result, item) => {
      result[item[0]] = item[1];
      return result;
    }, {});
};

const getEarnings =
  (earningsRepo) =>
  async (filterCriteria = undefined, url) => {
    let filter = {};
    let options = { limit: 100, offset: 0 };
    filter = FilterCriteria({
      ...filterCriteria,
    });
    const queryObject = {
      ...QueryOptions({ ...filterCriteria }),
      ...filterCriteria,
    };
    options = { ...options, ...queryObject };

    // remove offset property, as it is calculated later
    delete queryObject.offset;

    const query = Object.keys(queryObject)
      .map((key) => `${key  }=${  queryObject[key]}`)
      .join('&');

    const urlWithLimitAndOffset = `${url}?${query}&offset=`;

    const next = `${urlWithLimitAndOffset}${+options.offset + 1}`;
    let prev = null;
    if (options.offset - 1 >= 0) {
      prev = `${urlWithLimitAndOffset}${+options.offset - 1}`;
    }

    const earnings = await earningsRepo.getEarnings(filter, options);
    return {
      earnings: earnings.map((row) => {
        return Earning({ ...row });
      }),
      links: {
        prev,
        next,
      },
    };
  };

const updateEarnings = async (earningsRepo, requestBody) => {
  const body = { ...requestBody };
  const { worker_id, currency, amount } = body;

  // If data is coming from csv file
  if (body.earnings_id) {
    body.id = body.earnings_id;
    delete body.earnings_id;
  }
  delete body.phone;

  const earnings = await earningsRepo.getById(body.id);

  if (earnings.status !== 'calculated')
    throw new HttpError(409, 'Earnings have either been paid or cancelled');

  if (earnings.payment_confirmation_id)
    throw new HttpError(409, 'Earnings already have a payment_confirmation_id');

  if (earnings.worker_id !== worker_id)
    throw new HttpError(
      409,
      'The worker id specified does not match that of the earning',
    );

  if (earnings.currency !== currency)
    throw new HttpError(
      409,
      'The currency specified does not match that of the earning',
    );

  if (+earnings.amount !== +amount)
    throw new HttpError(
      409,
      'The amount specified does not match that of the earning',
    );

  await earningsRepo.update({
    ...body,
    status: 'paid',
    payment_confirmed_at: new Date(),
  });

  return {
    status: 'completed',
    count: 1,
  };
};

const getBatchEarnings =
  (earningsRepo) =>
  async (filterCriteria = undefined) => {
    let filter = {};
    filter = FilterCriteria({
      ...filterCriteria,
    });

    // knex stream not being 'awaited'
    const earningsStream = await earningsRepo.getEarnings(filter, {
      stream: true,
    });
    // let earnings = [];
    // earningsStream
    //   .on('data', function (row) {
    //     earnings.push(BatchEarning({ ...row }));
    //   })
    //   .on('error', function (error) {
    //     console.log('error', error.message);
    //     throw new HttpError(500, error.message);
    //   })
    //   .on('end', function () {
    //     console.log('end');
    //   });

    return { earningsStream };
  };

module.exports = {
  getEarnings,
  updateEarnings,
  getBatchEarnings,
  BatchEarning,
};
