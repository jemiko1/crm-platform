Write tests for a module. Usage: /test <module-name>
Steps:
1. Find backend/crm-backend/src/$ARGUMENTS/
2. Read all service files
3. Create/update .spec.ts files — mock PrismaService and injected services
4. Test every public method: happy path + error + edge case
5. Run: cd backend\crm-backend ; npx jest --testPathPattern=$ARGUMENTS --verbose
6. Fix failures
7. Report: "Tests written and passing. [X] cases across [Y] methods."
