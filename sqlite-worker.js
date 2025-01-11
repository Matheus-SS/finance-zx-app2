importScripts('sql-wasm.js');

let db, SQL;
const DB_NAME = 'mydb.sqlite';
const DB_DIR_NAME = 'sqlite-database';
const GET_DIRECTORY_HANDLE_ERROR = 'A requested file or directory could not be found at the time an operation was processed.';
const GET_FILE_HANDLE_ERROR = 'Entry not found';

self.onmessage = async (event) => {
  console.log("Sqlite Worker: Message recebida do script principal");

  const { method, payload } = event.data;
  console.log("payload", payload)
  try {
    let result;
    switch (method) {
      case 'init-db':
        await initDb();
        result = true;
        break
      case 'create-expenses':
        await createExpenses(payload);
        result = true;
        break
      case 'list-expenses':
        result = listExpenses();
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


async function initDb() {
  try {
    SQL = await initSqlJs({
      locateFile: filename => 'sql-wasm.wasm',
      print: console.log,
      printErr: console.error
    }); // Carrega o SQLite WASM
    console.log("SQLite inicializado no Worker.");

    const dbFile = await readDatabaseFileFromOPFS();

    if (dbFile) {
      const data = await dbFile.arrayBuffer()
      db = new SQL.Database(new Uint8Array(data))
      db.run(`
          CREATE TABLE IF NOT EXISTS expenses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              value DECIMAL (10,2),
              date  TEXT NOT NULL,
              description TEXT NOT NULL,
              type INTEGER NOT NULL CHECK (type IN (1,2)),
              notify BOOLEAN NOT NULL CHECK (notify IN (0,1)),
              paid BOOLEAN NOT NULL CHECK (paid IN (0,1)),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          `);
      console.log("Tabela 'expenses' criada caso não exista");
      console.log("criando dados no banco já existente");
    } else {
      db = new SQL.Database()
      db.run(`
          CREATE TABLE IF NOT EXISTS expenses (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              value DECIMAL (10,2),
              date  TEXT NOT NULL,
              description TEXT NOT NULL,
              type INTEGER NOT NULL CHECK (type IN (1,2)),
              notify BOOLEAN NOT NULL CHECK (notify IN (0,1)),
              paid BOOLEAN NOT NULL CHECK (paid IN (0,1)),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          `);

      console.log("Tabela 'expenses' criada");
      console.log("criando dados no novo banco");
    }
    await saveDatabaseIntoOPFS()
  } catch (error) {
    console.error('initDb: Error', error);
    console.error('initDb: Error', error.message);
    throw new Error(error);
  }
}

/**
 * Inserts a new expense record into the database.
 * 
 * @param {Object} data - The expense data to be inserted.
 * @param {number} data.value - The value of the expense.
 * @param {string} data.date - The date of the expense in YYYY-MM-DD format.
 * @param {string} data.description - A description of the expense.
 * @param {string} data.type - The type/category of the expense.
 * @param {boolean} data.notify - Whether to notify about this expense (true/false).
 * @param {boolean} data.paid - Whether the expense is marked as paid (true/false).
 * 
 * @returns {Promise<void>} Resolves when the record is successfully inserted.
 * 
 * @throws Will log an error if the database write operation fails.
 */
async function createExpenses(data) {
    const sql = `INSERT INTO expenses (
      value, 
      date, 
      description, 
      type, 
      notify, 
      paid
    ) VALUES (?, ?, ?, ?, ?, ?);`;

    const params = Object.values(data);
    await runDBWrite(sql, params);
}

/**
 * Retrieves a list of all expenses from the database, ordered by the first column in descending order.
 * 
 * @returns {Array<{
*   value: number,
*   date: string,
*   description: string,
*   type: string,
*   notify: boolean,
*   paid: boolean,
*   created_at: Date
* }>} An array of expense records. Each record is an object with the following properties:
* - `value` (number): The value of the expense.
* - `date` (string): The date of the expense in YYYY-MM-DD format.
* - `description` (string): A description of the expense.
* - `type` (string): The type or category of the expense.
* - `notify` (boolean): Whether to notify about this expense (true/false).
* - `paid` (boolean): Whether the expense is marked as paid (true/false).
* - `created_at` (Date): When the expenses was inserted.
* 
* @throws Will throw an error if the database query fails.
*/
function listExpenses() {
    const sql = `SELECT * FROM expenses ORDER BY 1 DESC`;
    const result = runDBQuery(sql);
    return result;
};

function runDBQuery(sql, params = {}) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    console.log("QUERY:", sql);
    console.log("PARAMS:", params);
    const result = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result.push(row);
    };
    return result;
  } catch (error) {
    console.error("runDBQueryError", error)
  }
}

async function runDBWrite(sql, params = []) {
  try {
    console.log("WRITE:", sql);
    console.log("PARAMS:", params);
    db.run(sql, params);
    await saveDatabaseIntoOPFS();
  } catch (error) {
    console.error("runDBWriteError", error);
  }
};

async function saveDatabaseIntoOPFS() {
  const sqliteData = db.export();

  const fileSystemDirectoryHandle = await navigator.storage.getDirectory();

  // cria pasta se nao existir o arquivo sqlite
  const directory = await fileSystemDirectoryHandle.getDirectoryHandle(DB_DIR_NAME, {
    create: true
  });

  // cria arquivo se nao existir o arquivo sqlite
  const fileHandle = await directory.getFileHandle(DB_NAME, {
    create: true
  });

  const syncAccessHandle = await fileHandle.createSyncAccessHandle();

  await syncAccessHandle.write(sqliteData);

  await syncAccessHandle.close();
}

async function readDatabaseFileFromOPFS() {
  const fileSystemDirectoryHandle = await navigator.storage.getDirectory();

  let directory;
  try {
    directory = await fileSystemDirectoryHandle.getDirectoryHandle(DB_DIR_NAME);
  } catch (error) {
    if (error.message === GET_DIRECTORY_HANDLE_ERROR) {
      return false
    }
    console.error(`readDatabaseFileFromOPFS - directory: ${error}`);
  }

  let fileHandle;
  try {
    fileHandle = await directory.getFileHandle(DB_NAME);
  } catch (error) {
    if (error.message === GET_FILE_HANDLE_ERROR) {
      return false
    }
    console.error(`readDatabaseFileFromOPFS - fileHandle: ${error}`);
  }

  const databaseFile = await fileHandle.getFile();
  return databaseFile;
};