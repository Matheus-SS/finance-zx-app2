importScripts('sqlite3.js')

self.onmessage = async (event) => {
  console.log("Sqlite Worker: Message recebida do script principal");

  const { method, payload } = event.data;
  console.log("payload", payload)
  try {
    let result;
    switch(method) {
      case 'insert-data':
        await insertData(payload);
        result = true;
        break
      case 'select-data':
        await selectExpenses(payload);
        result = true;
        break
      default:
        throw new Error(`Ação desconhecida: ${method}`);
    }
    self.postMessage({ status: 'success', data: result });
  } catch (error) {
    console.error("worker onmessage: error", error)
    self.postMessage({ status: 'error', data: error.message });
  }
};

async function insertData(db) {
  try {
    db.exec(`
      INSERT INTO expenses (
          value, 
          date, 
          description, 
          type, 
          notify, 
          paid
      ) VALUES (150.25, '20/10/2024', 'Academia', 1, 0, 0);
  `);

    console.log("insert 'expenses' criada");
  } catch (error) {
    console.error('initDb: Error', error);
    throw new Error(error);
  } 
}

async function selectExpenses(db) {
  try {
      const results = [];
      
      // Executa a query e coleta resultados
      db.exec({
          sql: 'SELECT * FROM expenses ORDER BY id DESC',
          rowMode: 'object',
          callback: (row) => results.push(row)
      });
      
      console.log('results',results);
  } catch (error) {
      throw new Error(`Falha ao selecionar usuários: ${error.message}`);
  }
}