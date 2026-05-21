"""
Shared test setup. pytest automatically loads any file named conftest.py.

The important thing here is the `db` fixture. A *fixture* is reusable setup
code: any test that needs a database simply adds `db` as a parameter, and
pytest runs this setup before the test and the teardown after it.

Our `db` fixture gives every test its OWN fresh, empty database, so tests
can never interfere with each other or touch the real woodhull.db file.
"""
import os
import tempfile
import pytest


@pytest.fixture
def db():
    # 1. Create a brand-new empty SQLite file just for this one test.
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp.name}"

    # 2. The app caches its database connection in app.db._engine.
    #    Reset it so the app reconnects to our fresh temp database.
    import app.db
    app.db._engine = None

    # 3. Build the schema by running all migrations against the temp DB.
    from app.migrate import apply_all
    apply_all()

    # 4. Hand control to the test.
    yield

    # 5. Teardown: close the connection and delete the temp file.
    import app.db as _db
    if _db._engine is not None:
        _db._engine.dispose()
    _db._engine = None
    os.unlink(tmp.name)
