//---------------------E2E---------------------

export const createInventoryObject = {
  _id: '5f9f1b9b9b9b9b9b9b9b9b9b',
  content: {
    item: '636cd17be0c064c2f001dce3',
    amount: 0,
  },
  slots: 100,
};

export const updateInventoryObject = {
  _id: '5f9f1b9b9b9b9b9b9b9b9b9b',
  slots: 20,
};

export const emptyResponse = {
  totalCount: 0,
  results: [],
};

export const responseInventory = {
  totalCount: 1,
  results: [
    {
      _id: '5f9f1b9b9b9b9b9b9b9b9b9b',
      content: [
        {
          item: '636cd17be0c064c2f001dce3',
          amount: 0,
        },
      ],
      slots: 100,
    },
  ],
};

export const responseUpdateInventory = {
  totalCount: 1,
  results: [
    {
      _id: '5f9f1b9b9b9b9b9b9b9b9b9b',
      slots: 20,
    },
  ],
};
