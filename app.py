from flask import Flask, render_template, jsonify, request, redirect, url_for, session, make_response, Response
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg2
import csv
from io import StringIO
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'a6d3f1a34e9f68c01f2bb892a1fc2342'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour session timeout

def get_db_connection():
    try:
        return psycopg2.connect(
            host="localhost",
            database="finance_tracker",
            user="postgres",
            password="password"
        )
    except psycopg2.OperationalError as e:
        print(f"Failed to connect to database: {e}")
        raise

@app.route('/')
def index():
    print("Index route hit, redirecting to login")
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        try:
            username = request.form['username']
            password = request.form['password']
            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                cursor.execute("SELECT id, password, username FROM users WHERE username = %s", (username,))
                user = cursor.fetchone()
                if user and check_password_hash(user[1], password):
                    session['user_id'] = user[0]
                    session['username'] = user[2]
                    print(f"User {username} logged in successfully")
                    return redirect(url_for('dashboard'))
                else:
                    print("Invalid login attempt")
                    return render_template('login.html', error="Invalid credentials"), 401
            except psycopg2.Error as e:
                print(f"Database error: {e}")
                return render_template('login.html', error="Database error occurred"), 500
            finally:
                cursor.close()
                conn.close()
        except KeyError:
            print("Missing login form data")
            return render_template('login.html', error="Missing username or password"), 400
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        try:
            username = request.form['username']
            password = request.form['pin']
            if not username or not password:
                print("Missing signup form data")
                return render_template('signUp.html', error="Username and password are required"), 400
            hashed_password = generate_password_hash(password)
            conn = get_db_connection()
            cursor = conn.cursor()
            try:
                cursor.execute("INSERT INTO users (username, password) VALUES (%s, %s)", (username, hashed_password))
                conn.commit()
                print(f"User {username} signed up successfully")
                return redirect(url_for('login'))
            except psycopg2.IntegrityError:
                conn.rollback()
                print(f"Username {username} already exists")
                return render_template('signUp.html', error="Username already exists"), 400
            except psycopg2.Error as e:
                conn.rollback()
                print(f"Database error: {e}")
                return render_template('signUp.html', error="Database error occurred"), 500
            finally:
                cursor.close()
                conn.close()
        except KeyError:
            print("Missing signup form data")
            return render_template('signUp.html', error="Missing form data"), 400
    return render_template('signUp.html')

@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session or not session['user_id']:
        print("No user_id in session, redirecting to login")
        return redirect(url_for('login'))

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id FROM users WHERE id = %s", (session['user_id'],))
        if not cursor.fetchone():
            print(f"User {session['user_id']} not found")
            session.clear()
            return redirect(url_for('login'))

        cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM income WHERE user_id = %s", (session['user_id'],))
        total_income = cursor.fetchone()[0] or 0
        print(f"Total income: {total_income}")

        cursor.execute("SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = %s", (session['user_id'],))
        total_expense = cursor.fetchone()[0] or 0
        print(f"Total expense: {total_expense}")

        balance = total_income - total_expense

        cursor.execute("""SELECT source, amount, date, 'income' as type FROM income WHERE user_id = %s
            UNION
            SELECT category as source, amount, date, 'expense' as type FROM expenses WHERE user_id = %s
            ORDER BY date DESC LIMIT 10""", (session['user_id'], session['user_id']))
        transactions = [
            {"source": row[0], "amount": float(row[1]), "date": row[2].strftime("%d/%m/%Y"), "type": row[3]}
            for row in cursor.fetchall()
        ]
        print(f"Transactions fetched: {len(transactions)}")

        cursor.execute("SELECT source, amount, date FROM income WHERE user_id = %s ORDER BY date DESC", (session['user_id'],))
        incomes = [
            {"source": row[0], "amount": float(row[1]), "date": row[2].strftime("%d/%m/%Y")}
            for row in cursor.fetchall()
        ]

        cursor.execute("SELECT category, amount, date FROM expenses WHERE user_id = %s ORDER BY date DESC", (session['user_id'],))
        expenses = [
            {"category": row[0], "amount": float(row[1]), "date": row[2].strftime("%d/%m/%Y")}
            for row in cursor.fetchall()
        ]
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        return render_template('index.html', error="Unable to fetch data"), 500
    except Exception as e:
        print(f"Unexpected error: {e}")
        return render_template('index.html', error="An unexpected error occurred"), 500
    finally:
        cursor.close()
        conn.close()

    return render_template(
        'index.html',
        username=session.get('username', 'User'),
        total_income=total_income,
        total_expense=total_expense,
        balance=balance,
        transactions=transactions,
        incomes=incomes,
        expenses=expenses
    )

@app.route('/add-income', methods=['POST'])
def add_income():
    if 'user_id' not in session:
        print("Not logged in, rejecting add-income")
        return jsonify({"status": "error", "message": "Not logged in"}), 401
    try:
        source = request.form['source']
        amount = float(request.form['amount'])
        date = request.form['date']
        if not source or amount <= 0 or not date:
            print("Invalid income input")
            return jsonify({"status": "error", "message": "Invalid input"}), 400
    except (KeyError, ValueError):
        print("Missing or invalid income form data")
        return jsonify({"status": "error", "message": "Missing or invalid form data"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO income (user_id, source, amount, date)
            VALUES (%s, %s, %s, %s)
        """, (session['user_id'], source, amount, date))
        conn.commit()
        print(f"Income added: {source}, {amount}, {date}")
        return jsonify({"status": "success"})
    except psycopg2.Error as e:
        conn.rollback()
        print(f"Database error: {e}")
        return jsonify({"status": "error", "message": "Database error"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/add-expense', methods=['POST'])
def add_expense():
    if 'user_id' not in session:
        print("Not logged in, rejecting add-expense")
        return jsonify({"status": "error", "message": "Not logged in"}), 401
    try:
        category = request.form['category']
        amount = float(request.form['amount'])
        date = request.form['date']
        if not category or amount <= 0 or not date:
            print("Invalid expense input")
            return jsonify({"status": "error", "message": "Invalid input"}), 400
    except (KeyError, ValueError):
        print("Missing or invalid expense form data")
        return jsonify({"status": "error", "message": "Missing or invalid form data"}), 400
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO expenses (user_id, category, amount, date)
            VALUES (%s, %s, %s, %s)
        """, (session['user_id'], category, amount, date))
        conn.commit()
        print(f"Expense added: {category}, {amount}, {date}")
        return jsonify({"status": "success"})
    except psycopg2.Error as e:
        conn.rollback()
        print(f"Database error: {e}")
        return jsonify({"status": "error", "message": "Database error"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/income/income')
def income_data():
    if 'user_id' not in session:
        print("Not logged in, rejecting income data request")
        return jsonify({"status": "error", "message": "Not logged in"}), 401
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT source, amount, date FROM income WHERE user_id = %s", (session['user_id'],))
        rows = [{"source": row[0], "amount": float(row[1]), "date": row[2].strftime("%d/%m/%Y")} for row in cursor.fetchall()]
        print(f"Fetched {len(rows)} income records")
        return jsonify(rows)
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        return jsonify({"status": "error", "message": "Database error"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/expense/expenses')
def expenses_data():
    if 'user_id' not in session:
        print("Not logged in, rejecting expenses data request")
        return jsonify({"status": "error", "message": "Not logged in"}), 401
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT category, amount, date FROM expenses WHERE user_id = %s", (session['user_id'],))
        rows = [{"category": row[0], "amount": float(row[1]), "date": row[2].strftime("%d/%m/%Y")} for row in cursor.fetchall()]
        print(f"Fetched {len(rows)} expense records")
        return jsonify(rows)
    except psycopg2.Error as e:
        print(f"Database error: {e}")
        return jsonify({"status": "error", "message": "Database error"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/download-transactions')
def download_transactions():
    if 'user_id' not in session:
        print("Not logged in, rejecting download request")
        return redirect(url_for('login'))

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Fetch income and expense data
        cursor.execute("""
            SELECT 'income' as type, source, amount, date FROM income WHERE user_id = %s
            UNION ALL
            SELECT 'expense' as type, category as source, amount, date FROM expenses WHERE user_id = %s
            ORDER BY date DESC
        """, (session['user_id'], session['user_id']))
        transactions = cursor.fetchall()

        if not transactions:
            print("No transactions found for download")
            return jsonify({"status": "error", "message": "No transactions available"}), 404

        # Generate CSV
        output = StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(['type', 'source', 'amount', 'date'])  # CSV headers

        for row in transactions:
            writer.writerow([
                row[0],  # type
                row[1],  # source or category
                f"{row[2]:.2f}",  # amount
                row[3].strftime("%d/%m/%Y")  # date
            ])

        # Prepare response
        csv_content = output.getvalue()
        output.close()

        response = Response(
            csv_content,
            mimetype='text/csv',
            headers={
                'Content-Disposition': 'attachment; filename=transactions.csv',
                'Content-Type': 'text/csv; charset=utf-8'
            }
        )
        print(f"Generated CSV with {len(transactions)} transactions")
        return response

    except psycopg2.Error as e:
        print(f"Database error during download: {e}")
        return jsonify({"status": "error", "message": "Database error"}), 500
    except Exception as e:
        print(f"Unexpected error during download: {e}")
        return jsonify({"status": "error", "message": "Unexpected error"}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/logout')
def logout():
    print(f"Logout route hit, current session: {dict(session)}")
    session.clear()
    response = make_response(redirect(url_for('login')))
    response.set_cookie('session', '', expires=0)
    print("Session cleared, redirecting to login")
    return response

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)