-- Run AFTER surplus_food_rescue_network.sql, on the same database.
USE surplus_food_rescue;
CREATE TABLE APP_USER (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    role          ENUM('DONOR','RECIPIENT','VOLUNTEER') NOT NULL,
    donor_id      INT NULL,
    recipient_id  INT NULL,
    volunteer_id  INT NULL,
    CONSTRAINT fk_au_donor     FOREIGN KEY (donor_id)     REFERENCES DONOR(donor_id),
    CONSTRAINT fk_au_recipient FOREIGN KEY (recipient_id) REFERENCES RECIPIENT(recipient_id),
    CONSTRAINT fk_au_volunteer FOREIGN KEY (volunteer_id) REFERENCES VOLUNTEER(volunteer_id),
    CONSTRAINT chk_au_one_profile CHECK (
        (donor_id IS NOT NULL) + (recipient_id IS NOT NULL) + (volunteer_id IS NOT NULL) = 1)
);
