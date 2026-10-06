# Repository protection

The application auto-deploys `main` to production. Repository rules therefore form part of the production security boundary.

Recommended GitHub ruleset for `main`:

- require a pull request before merge;
- require the `CI / web` and `CI / worker` checks;
- require CodeQL checks;
- require branches to be up to date before merge;
- block force pushes;
- block branch deletion;
- do not allow bypass except for deliberate emergency recovery.

The connected GitHub integration used by Citeral automation does not have repository-administration access, so these settings must be enabled in GitHub's repository settings by an administrator.

Dependabot is configured in `.github/dependabot.yml`. Review dependency PRs instead of auto-merging them blindly.
