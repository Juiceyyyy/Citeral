from grounded_worker.import_manifest import _source_enabled


def test_source_enabled_defaults_true():
    assert _source_enabled({"title": "A"}) is True


def test_source_enabled_accepts_explicit_false():
    assert _source_enabled({"title": "A", "enabled": False}) is False


def test_source_enabled_rejects_non_boolean():
    try:
        _source_enabled({"title": "A", "enabled": "false"})
    except TypeError as exc:
        assert "must be a boolean" in str(exc)
    else:
        raise AssertionError("Expected TypeError")
