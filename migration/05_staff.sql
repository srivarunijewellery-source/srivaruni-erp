insert into staff (id,name,role,home_location_id,active) values
('43f866f1-7cbc-5a10-9872-cc5062754f4f','Asia','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('adcc22d5-1ddf-552c-a603-aec0891f9b07','LATHA U','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('9f5cb346-c263-5561-a6b5-0c2da32fd22e','MADHURI G','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('89274faa-68c8-58c2-a87f-e9d679e304c7','MAMATHA D','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('14025ae8-6b4d-504b-9618-83eb8d4330c7','Mounika','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('18727b22-e64b-50c3-b8e0-d22022fb60ca','PANDU B','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('0db988c1-b15b-5081-83d9-c56750bbd7e2','REVATHI J','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('54c47fda-2c0e-57be-8598-5a0fd9abfbf7','Ravali P','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('2d428232-2b65-519d-8cea-52b5b57935bc','SRI LAKSHMI P','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true),
('70cccf41-1116-5321-a244-61640f3d6688','Sales Manager','salesperson','c159a94f-93cd-4a59-8c05-dd04c3f84ebf',true)
on conflict (id) do nothing;
